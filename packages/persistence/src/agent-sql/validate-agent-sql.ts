import { parse } from "libpg-query";
import type { ScopedSqlScope } from "@repo/entities/ports";
import { logicalTableNames } from "./logical-schema";
import {
  ALLOWED_FUNCTIONS,
  ALLOWED_NODE_TYPES,
  ALLOWED_PG_CATALOG_FUNCTIONS,
  ALLOWED_SQL_VALUE_FUNCTIONS,
  ALLOWED_TYPES,
  MAX_AGENT_SQL_LENGTH,
} from "./sql-policy";

type Node = Record<string, unknown>;

export type AgentSqlValidation = { ok: true; statement: Node } | { ok: false; error: string };

class Rejected extends Error {}

function reject(message: string): never {
  throw new Rejected(message);
}

/**
 * Valida a query pelo AST do parser real do Postgres. Recusa tudo que nao for
 * um unico SELECT feito so de nos, funcoes, tipos e tabelas das listas.
 */
export async function validateAgentSql(sql: string, scope: ScopedSqlScope): Promise<AgentSqlValidation> {
  if (sql.length > MAX_AGENT_SQL_LENGTH) {
    return { ok: false, error: `A consulta passa de ${MAX_AGENT_SQL_LENGTH} caracteres.` };
  }

  let tree: { stmts?: Array<{ stmt?: Node }> };
  try {
    tree = await parse(sql);
  } catch (error) {
    return { ok: false, error: `SQL inválido: ${error instanceof Error ? error.message : String(error)}` };
  }

  const statements = tree.stmts ?? [];
  if (statements.length !== 1) {
    return { ok: false, error: "Envie exatamente uma instrução SELECT." };
  }
  const statement = statements[0].stmt;
  const select = statement?.SelectStmt as Node | undefined;
  if (!statement || !select) {
    return { ok: false, error: "Só consultas SELECT são permitidas." };
  }

  try {
    walkSelect(select, [logicalTableNames(scope)]);
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, statement };
}

type Scopes = ReadonlyArray<ReadonlySet<string>>;

function walkSelect(select: Node, scopes: Scopes): void {
  if (select.intoClause) reject("SELECT INTO não é permitido.");
  if (Array.isArray(select.lockingClause) && select.lockingClause.length > 0) {
    reject("FOR UPDATE/FOR SHARE não é permitido.");
  }

  let bodyScopes = scopes;
  const withClause = select.withClause as Node | undefined;
  if (withClause) {
    if (withClause.recursive) reject("WITH RECURSIVE não é permitido.");

    // Um CTE nao recursivo so enxerga os irmaos declarados antes dele.
    const defined: string[] = [];
    for (const entry of (withClause.ctes as Node[] | undefined) ?? []) {
      const cte = entry.CommonTableExpr as Node | undefined;
      if (!cte) reject("Cláusula WITH inválida.");
      if (cte.search_clause || cte.cycle_clause) reject("SEARCH/CYCLE não é permitido.");
      walkValue(cte.ctequery, [...scopes, new Set(defined)]);
      defined.push(String(cte.ctename));
    }
    bodyScopes = [...scopes, new Set(defined)];
  }

  for (const [key, value] of Object.entries(select)) {
    if (key === "withClause") continue;
    // Os ramos de UNION/INTERSECT/EXCEPT vem como SelectStmt sem o invólucro.
    if (key === "larg" || key === "rarg") {
      if (value) walkSelect(value as Node, bodyScopes);
      continue;
    }
    walkValue(value, bodyScopes);
  }
}

function walkValue(value: unknown, scopes: Scopes): void {
  if (Array.isArray(value)) {
    for (const item of value) walkValue(item, scopes);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const [key, child] of Object.entries(value)) {
    // No AST do libpg-query, chave com inicial maiuscula e tipo de no.
    if (/^[A-Z]/.test(key)) walkNode(key, child as Node, scopes);
    else walkValue(child, scopes);
  }
}

function walkNode(type: string, node: Node, scopes: Scopes): void {
  if (!ALLOWED_NODE_TYPES.has(type)) reject(`Construção SQL não permitida: ${type}.`);

  switch (type) {
    case "SelectStmt":
      walkSelect(node, scopes);
      return;
    case "CommonTableExpr":
      reject("Cláusula WITH fora de lugar.");
      return;
    case "RangeVar":
      checkRangeVar(node, scopes);
      return;
    case "FuncCall":
      checkFunction(node);
      walkValue(node, scopes);
      return;
    case "TypeCast":
      checkType(node.typeName as Node | undefined);
      walkValue(node, scopes);
      return;
    case "SQLValueFunction":
      if (!ALLOWED_SQL_VALUE_FUNCTIONS.has(String(node.op))) reject("Função de sistema não permitida.");
      return;
    case "A_Expr":
      checkOperator(node.name);
      walkValue(node, scopes);
      return;
    case "SubLink":
      checkOperator(node.operName);
      walkValue(node, scopes);
      return;
    case "SortBy":
      checkOperator(node.useOp);
      walkValue(node, scopes);
      return;
    default:
      walkValue(node, scopes);
  }
}

function checkRangeVar(node: Node, scopes: Scopes): void {
  if (node.schemaname || node.catalogname) reject("Use os nomes das tabelas sem schema.");
  const name = String(node.relname);
  if (!scopes.some((scope) => scope.has(name))) reject(`Tabela desconhecida: ${name}.`);
}

function namesOf(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(((item as Node).String as Node | undefined)?.sval ?? ""));
}

function checkFunction(node: Node): void {
  const names = namesOf(node.funcname);
  const allowed =
    (names.length === 1 && ALLOWED_FUNCTIONS.has(names[0])) ||
    (names.length === 2 && names[0] === "pg_catalog" && ALLOWED_PG_CATALOG_FUNCTIONS.has(names[1]));
  if (!allowed) reject(`Função não permitida: ${names.join(".")}.`);
}

function checkType(typeName: Node | undefined): void {
  if (!typeName || typeName.setof || typeName.pct_type) reject("Tipo não permitido.");
  const names = namesOf(typeName.names);
  const name = names.at(-1) ?? "";
  const qualifierOk = names.length === 1 || (names.length === 2 && names[0] === "pg_catalog");
  if (!qualifierOk || !ALLOWED_TYPES.has(name)) reject(`Tipo não permitido: ${names.join(".")}.`);
}

/** `OPERATOR(pg_catalog.=)` e afins: operador qualificado nao tem uso aqui. */
function checkOperator(list: unknown): void {
  if (Array.isArray(list) && list.length > 1) reject("Operador qualificado não é permitido.");
}
