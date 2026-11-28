import { spawn } from "node:child_process";
import { SANDBOX_LIMITS } from "./sql-policy";

/**
 * Roda a query do agente num processo filho descartavel, com um banco SQLite
 * em memoria que so tem as linhas do usuario.
 *
 * Por que um processo, e nao uma `worker_thread` nem o proprio processo da API:
 * o `node:sqlite` nao tem `sqlite3_interrupt` nem progress handler, e uma
 * consulta (`count(*)` sobre um produto cartesiano) e uma unica chamada nativa
 * que o JS nao consegue parar. `worker.terminate()` espera essa chamada
 * terminar (testado: um `count(*)` de produto cartesiano segura o worker, e o
 * processo, ate o fim). Com um processo filho, `SIGKILL` corta no prazo, de
 * verdade. O custo e ~50 ms de partida por consulta, que o agente nem nota.
 *
 * Camadas do sandbox, todas alem do banco descartavel:
 * - `--permission` sem nenhuma permissao: o filho nao le nem escreve arquivo,
 *   nao cria processo nem worker, nao carrega addon;
 * - ambiente vazio (so `TZ=UTC`): nenhum segredo da API chega ao filho;
 * - `enableDefensive(true)`, `PRAGMA query_only` e um authorizer que so deixa
 *   passar SELECT, leitura das tabelas logicas, as funcoes da lista e CTE
 *   recursiva; nega ATTACH, PRAGMA, DDL, escrita e transacao;
 * - tetos de memoria (`hard_heap_limit`, `--max-old-space-size`) e de tamanho
 *   de celula, de expressao e de operacoes compostas;
 * - uma instrucao so: o que sobra depois da primeira e recusado.
 */

export interface SandboxTable {
  name: string;
  createSql: string;
  columns: string[];
  rows: unknown[][];
}

export interface SandboxRequest {
  tables: SandboxTable[];
  sql: string;
  rowCap: number;
  maxCellChars: number;
  maxTotalChars: number;
  allowedFunctions: string[];
  allowedTableFunctions: string[];
}

export type SandboxOutcome =
  | { ok: true; columns: string[]; rows: unknown[][]; truncated: boolean }
  | { ok: false; error: string };

/** O que o filho imprime em stdout passa disto, e a API o mata: nenhuma resposta valida chega perto. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * O programa do filho, em JavaScript puro (CommonJS) e como texto, para valer
 * igual no `nest build`, no tsx e no vitest, sem depender de onde o arquivo
 * compilado fica. Le a requisicao em JSON no stdin e escreve o resultado em
 * JSON no stdout. Nada aqui e politica: as listas vem na requisicao.
 */
const CHILD_SOURCE = `
const { DatabaseSync, constants: K } = require("node:sqlite");
const LIMITS = ${JSON.stringify(SANDBOX_LIMITS)};

function execute(req) {
  const db = new DatabaseSync(":memory:");
  // O ordenador e as tabelas temporarias ficam na memoria (o filho nao pode abrir arquivo), sob o hard_heap_limit.
  db.exec("PRAGMA temp_store = MEMORY");
  for (const table of req.tables) {
    db.exec(table.createSql);
    const insert = db.prepare("INSERT INTO " + table.name + " (" + table.columns.join(", ") + ") VALUES (" + table.columns.map(() => "?").join(", ") + ")");
    db.exec("BEGIN");
    for (const row of table.rows) insert.run(...row);
    db.exec("COMMIT");
  }

  db.exec("PRAGMA query_only = ON");
  db.exec("PRAGMA hard_heap_limit = " + LIMITS.hardHeapBytes);
  db.limits.length = LIMITS.length;
  db.limits.exprDepth = LIMITS.exprDepth;
  db.limits.compoundSelect = LIMITS.compoundSelect;
  db.limits.functionArg = LIMITS.functionArg;
  db.limits.likePatternLength = LIMITS.likePatternLength;
  db.enableDefensive(true);

  const tables = new Set(req.tables.map((table) => table.name));
  // O que existe no SQLite alem das tabelas da copia: o catalogo, as funcoes de PRAGMA e os modulos de tabela virtual.
  const modules = new Set(db.prepare("PRAGMA module_list").all().map((row) => String(row.name).toLowerCase()));
  const builtin = (name) => /^(sqlite_|pragma_)/.test(name) || modules.has(name);
  const functions = new Set(req.allowedFunctions);
  const tableFunctions = new Set(req.allowedTableFunctions);
  let denied = null;
  let probing = false;
  db.setAuthorizer((action, arg1, arg2, arg3) => {
    if (probing) return K.SQLITE_DENY;
    switch (action) {
      case K.SQLITE_SELECT:
      case K.SQLITE_RECURSIVE:
        return K.SQLITE_OK;
      case K.SQLITE_READ:
        // Sem coluna (arg2 vazio) e um count(*) ou um SELECT 1: so conta linhas, e o nome de uma CTE chega igual ao de
        // uma tabela. Nome de CTE passa; o que existe de verdade fora da copia nao. Leitura de coluna so de tabela da lista.
        if (arg2 === "" && !builtin(String(arg1).toLowerCase())) return K.SQLITE_OK;
        if (arg3 === "main" && arg1 !== null && (tables.has(arg1) || tableFunctions.has(arg1))) return K.SQLITE_OK;
        denied = denied || "Tabela desconhecida: " + arg1 + ".";
        return K.SQLITE_DENY;
      case K.SQLITE_FUNCTION:
        if (functions.has(String(arg2).toLowerCase())) return K.SQLITE_OK;
        denied = denied || "Função não permitida: " + arg2 + ".";
        return K.SQLITE_DENY;
      default:
        denied = denied || "Só consultas SELECT são permitidas.";
        return K.SQLITE_DENY;
    }
  });

  const failure = (error) => ({ ok: false, error: denied || (error instanceof Error ? error.message : String(error)) });
  const ONE_STATEMENT = { ok: false, error: "Envie exatamente uma instrução SELECT." };

  let statement;
  try {
    statement = db.prepare(req.sql);
  } catch (error) {
    return failure(error);
  }

  // O prepare compila so a primeira instrucao e ignora o resto sem avisar. "Resto" so pode ser espaco, ';' ou comentario:
  // preparar o resto tem que falhar com "no statements".
  const rest = req.sql.slice(statement.sourceSQL.length);
  if (rest.length > 0) {
    probing = true;
    try {
      db.prepare(rest);
      return ONE_STATEMENT;
    } catch (error) {
      if (!/no statements/i.test(error instanceof Error ? error.message : "")) return ONE_STATEMENT;
    } finally {
      probing = false;
    }
  }

  const columns = statement.columns().map((column) => column.name);
  if (columns.length === 0) return { ok: false, error: "Só consultas SELECT são permitidas." };

  const cell = (value) => {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "bigint") return Number(value);
    if (value instanceof Uint8Array) return "<blob " + value.length + " bytes>";
    return value.length <= req.maxCellChars ? value : value.slice(0, req.maxCellChars) + "…";
  };

  const rows = [];
  let truncated = false;
  let total = JSON.stringify(columns).length;
  try {
    statement.setReturnArrays(true);
    for (const row of statement.iterate()) {
      if (rows.length >= req.rowCap) {
        truncated = true;
        break;
      }
      const cells = row.map(cell);
      total += JSON.stringify(cells).length;
      if (total > req.maxTotalChars) {
        truncated = true;
        break;
      }
      rows.push(cells);
    }
  } catch (error) {
    return failure(error);
  }
  return { ok: true, columns, rows, truncated };
}

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let outcome;
  try {
    outcome = execute(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(JSON.stringify(outcome));
});
`;

/** Executa e espera o filho terminar (ou o mata no prazo); nunca rejeita. */
export function runInSandbox(request: SandboxRequest, timeoutMs: number): Promise<SandboxOutcome> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--permission", `--max-old-space-size=${SANDBOX_LIMITS.maxOldSpaceMb}`, "-e", CHILD_SOURCE],
      { stdio: ["pipe", "pipe", "ignore"], env: { TZ: "UTC" }, windowsHide: true },
    );

    const output: Buffer[] = [];
    let outputBytes = 0;
    let verdict: SandboxOutcome | undefined;
    const kill = (outcome: SandboxOutcome) => {
      verdict ??= outcome;
      child.kill("SIGKILL");
    };

    const timer = setTimeout(
      () => kill({ ok: false, error: `A consulta passou de ${Math.trunc(timeoutMs)} ms e foi cancelada.` }),
      Math.trunc(timeoutMs),
    );

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) kill({ ok: false, error: "O resultado da consulta é grande demais." });
      else output.push(chunk);
    });
    // Se o filho morre antes de ler o stdin, o EPIPE nao pode derrubar a API.
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "Não foi possível executar a consulta." });
    });
    // Resolve so no `close`, com o processo ja encerrado e a saida inteira lida.
    child.on("close", () => {
      clearTimeout(timer);
      resolve(verdict ?? parse(Buffer.concat(output).toString("utf8")));
    });

    child.stdin.end(JSON.stringify(request));
  });
}

function parse(text: string): SandboxOutcome {
  try {
    const outcome = JSON.parse(text) as SandboxOutcome;
    if (typeof outcome === "object" && outcome !== null && typeof outcome.ok === "boolean") return outcome;
  } catch {
    // cai no erro generico abaixo
  }
  // O filho caiu sem responder (memoria, sinal): sem detalhe, que o texto volta para o modelo.
  return { ok: false, error: "A consulta falhou ao executar." };
}
