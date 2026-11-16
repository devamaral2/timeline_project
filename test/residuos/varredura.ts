import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Varredura de residuos da troca de "evento" por "tarefa".
 *
 * Acha "event" e "evento" usados como nome da entidade em codigo, textos,
 * prompts, esquema do banco e rotas das areas listadas em `RAIZES`. A lista de
 * excecoes (`EXCECOES`) e explicita e curta: cada uma tem um motivo.
 */

export const RAIZ_DO_REPOSITORIO = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

/** Pastas varridas (apps/mobile e docs ficam de fora de proposito). */
export const RAIZES = [
  "apps/web",
  "apps/api",
  "apps/auth",
  "apps/mcp",
  "packages/contracts",
  "packages/timeline",
  "packages/theme",
];

/** Historico que nao se edita: migrations ja aplicadas (SQL e snapshots do drizzle). */
const CAMINHOS_IGNORADOS = [/^apps\/api\/drizzle\//, /^apps\/auth\/drizzle\//];

/**
 * Arquivos cujo conteudo inteiro fala de outra coisa chamada "evento". O nome
 * do arquivo e as demais regras continuam valendo.
 */
export const ARQUIVOS_COM_OUTRO_EVENTO: { motivo: string; arquivo: RegExp }[] = [
  {
    motivo: "evento de auditoria e de log do Auth: registro de seguranca, nao a entidade",
    arquivo: /^apps\/auth\/src\/(audit\/|common\/logger\.ts$|features\/login-with-password\/postgres-login\.repository\.ts$)/,
  },
  {
    motivo: "eventos do stream de execucao do Hermes (`GET /v1/runs/{id}/events`): protocolo do Hermes, nao a entidade",
    arquivo: /^apps\/api\/src\/infrastructure\/hermes\/(hermes-trace|hermes\.client)[\w.-]*\.ts$/,
  },
  {
    motivo: "testes das migrations que renomeiam o banco e os dados do agente: gravam dados com os nomes antigos de proposito, para provar que a migration os troca",
    arquivo: /^apps\/api\/src\/infrastructure\/persistence\/integration\/(task-rename|agent-data)-migration\.integration\.test\.ts$/,
  },
];

const EXTENSOES_DE_TEXTO =
  /\.(ts|tsx|js|jsx|mjs|cjs|css|scss|md|mdx|json|sql|ya?ml|html|txt|sh|toml)$/i;
const ARQUIVOS_IGNORADOS = /(^|\/)(pnpm-lock\.yaml|next-env\.d\.ts|tsconfig\.tsbuildinfo)$/;
const TAMANHO_MAXIMO = 1_000_000;

/**
 * Palavras (identificadores, caminhos, palavras de texto) com "event" que NAO
 * sao a entidade. Cada excecao precisa de um motivo.
 */
export const EXCECOES: { motivo: string; palavra: RegExp }[] = [
  {
    motivo: 'verbo ingles "prevent"/"eventually", que so contem as letras',
    palavra: /prevent|eventual/i,
  },
  {
    motivo: "eventos de DOM e de teclado (tipos, ouvintes, dispatch) e utilitarios de teste deles",
    palavra:
      /^(add|remove)EventListener$|^dispatchEvent$|^createEvent$|^initEvent$|^(Custom|Keyboard|Mouse|Pointer|Change|Form|Touch|Focus|Drag|Clipboard|Submit|UI|Wheel|Input|Message|Composition|Animation|Transition|BeforeUnload|PageTransition|Progress|Storage|Error|Close|Hash|PopState|Security|Media|Toggle)Event$|^EventTarget$|^EventListener(OrObject)?$|^EventSource$|^(fire|user)Event$|^userEvent$|^user-event$|^eventPhase$|^nativeEvent$|^bubbles$|^useEffectEvent$|^MouseEventHandler$|^(Keyboard|Mouse|Pointer|Change|Form|Touch|Focus|Drag|Clipboard)EventHandler$|^(on|onchange)event$/i,
  },
  {
    motivo: "eventos de DOM do navegador citados por nome (SpeechRecognition, CSS pointer-events)",
    palavra: /^SpeechRecognition(Error)?Event$|^pointer-events$/,
  },
  {
    motivo: "nomes de eventos de DOM personalizados do app, disparados com window.dispatchEvent",
    palavra: /^(agendaRefreshEvent|hubOpenEvent|hermesDockEvent)$/,
  },
  {
    motivo: "evento de auditoria e de log do Auth: registro de seguranca, nao a entidade",
    palavra: /audit|^AuthLogEvent$/i,
  },
  {
    motivo: "text/event-stream: protocolo de Server-Sent Events, nao a entidade",
    palavra: /^event-stream$/i,
  },
];

/**
 * Excecoes que dependem da linha: a palavra so e liberada quando a linha tem o
 * formato indicado. `palavras` diz quais palavras da linha ela libera.
 */
export const EXCECOES_DE_LINHA: { motivo: string; linha: RegExp; palavras: RegExp }[] = [
  {
    motivo: "parametro `event` de handler de DOM: uso de propriedades e metodos do evento do navegador",
    linha:
      /\bevent\.(target|currentTarget|key|code|preventDefault|stopPropagation|stopImmediatePropagation|nativeEvent|clipboardData|dataTransfer|metaKey|ctrlKey|shiftKey|altKey|button|buttons|touches|changedTouches|detail|clientX|clientY|pageX|pageY|pointerId|pointerType|isComposing|repeat|persisted|matches|type|data|deltaY|deltaX|relatedTarget|submitter|isTrusted|defaultPrevented|results|resultIndex|error)\b/,
    palavras: /^event$/,
  },
  {
    motivo: "parametro `event` de handler de DOM: anotacao com tipo de evento do navegador",
    linha: /\bevent\??:\s*(React\.)?\w*Event\b/,
    palavras: /^event$/,
  },
  {
    motivo: "parametro `event` de handler de DOM: arrow function de `onXxx={...}`",
    linha: /\bon[A-Z]\w*=\{\(?event\)?\s*=>/,
    palavras: /^event$/,
  },
  {
    motivo: "`new Event(...)` e `new CustomEvent(...)`: criam eventos de DOM",
    linha: /\bnew\s+(Custom)?Event\b/,
    palavras: /^(Event|CustomEvent)$/,
  },
  {
    motivo: "campo `event` dos eventos do stream do Hermes e do protocolo Server-Sent Events (`tool.started`, `run.failed`)",
    linha: /(^|[^\w])"?event"?:\s*(["'`][a-z]+\.[a-z_]+["'`]|\$\{)/,
    palavras: /^event$/,
  },
];

export type Residuo = {
  arquivo: string;
  /** Numero da linha (1-based); 0 para nome de arquivo ou de pasta. */
  linha: number;
  /** Texto da linha sem espacos nas pontas, ou "[nome de arquivo]"/"[nome de pasta]". */
  texto: string;
};

const CONTEM_EVENT = /event/i;

export function palavrasComEvent(texto: string): string[] {
  return (texto.match(/[A-Za-z0-9_-]+/g) ?? []).filter((p) => CONTEM_EVENT.test(p));
}

export function palavraExcetuada(palavra: string): boolean {
  return EXCECOES.some((e) => e.palavra.test(palavra));
}

/** Verdadeiro se a linha tem "event" como nome da entidade. */
export function linhaTemResiduo(linha: string): boolean {
  const palavras = palavrasComEvent(linha);
  if (palavras.length === 0) return false;
  const porLinha = EXCECOES_DE_LINHA.filter((e) => e.linha.test(linha));
  return palavras.some((palavra) => {
    if (palavraExcetuada(palavra)) return false;
    if (porLinha.some((e) => e.palavras.test(palavra))) return false;
    return true;
  });
}

function arquivosDoRepositorio(raiz: string): string[] {
  const saida = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...RAIZES],
    { cwd: raiz, maxBuffer: 64 * 1024 * 1024 },
  ).toString("utf8");
  return [...new Set(saida.split("\0").filter(Boolean))].sort();
}

/** Acha todos os residuos do repositorio, em ordem estavel. */
export function varrer(raiz: string = RAIZ_DO_REPOSITORIO): Residuo[] {
  const residuos: Residuo[] = [];
  const pastasVistas = new Set<string>();
  for (const arquivo of arquivosDoRepositorio(raiz)) {
    if (CAMINHOS_IGNORADOS.some((r) => r.test(arquivo))) continue;
    if (ARQUIVOS_IGNORADOS.test(arquivo)) continue;
    const absoluto = join(raiz, arquivo);
    let tamanho: number;
    try {
      tamanho = statSync(absoluto).size;
    } catch {
      continue; // arquivo removido e ainda listado pelo git
    }

    const partes = arquivo.split("/");
    partes.forEach((parte, i) => {
      if (!CONTEM_EVENT.test(parte)) return;
      if (palavrasComEvent(parte).every(palavraExcetuada)) return;
      const ultimo = i === partes.length - 1;
      const caminho = partes.slice(0, i + 1).join("/");
      if (!ultimo) {
        if (pastasVistas.has(caminho)) return;
        pastasVistas.add(caminho);
      }
      residuos.push({
        arquivo: ultimo ? caminho : `${caminho}/`,
        linha: 0,
        texto: ultimo ? "[nome de arquivo]" : "[nome de pasta]",
      });
    });

    if (!EXTENSOES_DE_TEXTO.test(arquivo) || tamanho > TAMANHO_MAXIMO) continue;
    if (ARQUIVOS_COM_OUTRO_EVENTO.some((e) => e.arquivo.test(arquivo))) continue;
    const linhas = readFileSync(absoluto, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      if (linhaTemResiduo(linha)) {
        residuos.push({ arquivo, linha: i + 1, texto: linha.trim() });
      }
    });
  }
  return residuos;
}

/**
 * Areas da linha de base, com nomes que casam com os tickets que as limpam.
 * A ordem aqui e a ordem das secoes no arquivo.
 */
export const AREAS = [
  "banco",
  "auth",
  "contratos",
  "timeline",
  "rotas",
  "gateway",
  "mcp",
  "api",
  "agentes",
  "web, código",
  "web, textos e rotas",
] as const;
export type Area = (typeof AREAS)[number];

const CAMINHO_DA_API_ANTIGA = /\/api\/events/;
const DECORADOR_DE_ROTA = /@(Controller|Get|Post|Put|Patch|Delete|ApiTags|ApiOperation|ApiParam|ApiResponse|ApiBody)\(/;
const ARQUIVO_DE_ROTA_DA_API =
  /^apps\/api\/src\/(http\/|common\/openapi)/;
const ARQUIVO_DE_AGENTE =
  /^apps\/api\/src\/(api-core\/(requests|agent)\/|api-core\/events\/gateways\/|infrastructure\/(hermes|persistence\/agent-sql)\/)|prompt-builder|command-parsing|voice-event/;
const PERSISTENCIA_DA_API =
  /^apps\/api\/src\/infrastructure\/(persistence|jobs)\//;

/** Palavras da linha que tem "event" e nao sao excecao. */
function palavrasResiduais(texto: string): string[] {
  return palavrasComEvent(texto).filter((p) => !palavraExcetuada(p));
}

/** Nome fisico do banco: `event_id`, `from_event_id`, `events` em SQL ou `pgTable("events"`. */
function ehNomeFisicoDoBanco(texto: string): boolean {
  if (/\b(from|join|into|update|table|pgTable\()\s*\(?\s*"?events?\b/i.test(texto)) return true;
  return palavrasResiduais(texto).some((p) => /^[a-z0-9]*(_[a-z0-9]+)*$/.test(p) && /(^|_)events?(_|$)/.test(p) && p.includes("_"));
}

/** Decide a area de um residuo. Caminhos de arquivo e pasta usam `linha: 0`. */
export function areaDe(residuo: Residuo): Area {
  const { arquivo, texto } = residuo;
  const nomeDeCaminho = residuo.linha === 0;
  if (arquivo.startsWith("apps/mcp/")) return "mcp";
  if (arquivo.startsWith("packages/contracts/")) return "contratos";
  if (arquivo.startsWith("packages/timeline/")) return "timeline";
  if (arquivo.startsWith("packages/theme/")) return "web, textos e rotas";
  if (!nomeDeCaminho && CAMINHO_DA_API_ANTIGA.test(texto)) {
    return arquivo.startsWith("apps/auth/") ? "gateway" : "rotas";
  }
  if (arquivo.startsWith("apps/auth/")) return "auth";
  if (arquivo.startsWith("apps/api/")) {
    if (ARQUIVO_DE_ROTA_DA_API.test(arquivo)) return "rotas";
    if (!nomeDeCaminho && DECORADOR_DE_ROTA.test(texto)) return "rotas";
    if (ARQUIVO_DE_AGENTE.test(arquivo)) return "agentes";
    if (!nomeDeCaminho && PERSISTENCIA_DA_API.test(arquivo) && ehNomeFisicoDoBanco(texto)) return "banco";
    return "api";
  }
  // apps/web: palavra em portugues ("evento") ou segmento de rota do App Router = texto e rota.
  if (nomeDeCaminho) {
    const nome = arquivo.replace(/\/$/, "").split("/").pop() ?? "";
    const ehPasta = arquivo.endsWith("/");
    const rota = ehPasta && arquivo.startsWith("apps/web/src/app/");
    return rota || /evento/i.test(nome) ? "web, textos e rotas" : "web, código";
  }
  return palavrasResiduais(texto).some((p) => /evento/i.test(p))
    ? "web, textos e rotas"
    : "web, código";
}

/** Chave de comparacao com a linha de base. */
export function chaveDe(area: Area | string, arquivo: string, texto: string): string {
  return `${area}\t${arquivo}\t${texto.replace(/\t/g, " ")}`;
}
