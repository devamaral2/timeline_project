import { parse } from "libpg-query";
import type { ScopedSqlScope } from "@repo/entities/ports";
import { buildShadowCtes, logicalTables } from "./logical-schema";

type Node = Record<string, unknown>;

export class AgentSqlRewriteError extends Error {}

/**
 * Embrulha a query ja validada numa subquery sob os CTEs de escopo. As quebras
 * de linha em volta impedem que um `--` no fim da query engula o `)`.
 *
 * Nao confia na concatenacao: faz o parse do resultado e exige que a subquery
 * seja exatamente a query validada e que os CTEs sejam os de escopo.
 */
export async function buildScopedSql(
  userSql: string,
  validatedStatement: Node,
  rowLimit: number,
  scope: ScopedSqlScope,
): Promise<string> {
  const body = userSql.trim().replace(/[;\s]+$/, "");
  const scopedSql = `WITH ${buildShadowCtes(scope)}\nSELECT * FROM (\n${body}\n) AS agent_q\nLIMIT ${Math.trunc(rowLimit)}`;

  let tree: { stmts?: Array<{ stmt?: Node }> };
  try {
    tree = await parse(scopedSql);
  } catch {
    throw new AgentSqlRewriteError("Não foi possível preparar a consulta. Envie um único SELECT, sem ';' no meio.");
  }

  if (!hasExpectedShape(tree, validatedStatement, scope)) {
    throw new AgentSqlRewriteError("Não foi possível preparar a consulta com segurança.");
  }
  return scopedSql;
}

function hasExpectedShape(
  tree: { stmts?: Array<{ stmt?: Node }> },
  validatedStatement: Node,
  scope: ScopedSqlScope,
): boolean {
  if (tree.stmts?.length !== 1) return false;
  const select = tree.stmts[0].stmt?.SelectStmt as Node | undefined;
  if (!select) return false;

  const ctes = ((select.withClause as Node | undefined)?.ctes as Node[] | undefined) ?? [];
  const cteNames = ctes.map((entry) => (entry.CommonTableExpr as Node | undefined)?.ctename);
  if (JSON.stringify(cteNames) !== JSON.stringify(logicalTables(scope).map((table) => table.name))) return false;

  const from = select.fromClause as Node[] | undefined;
  if (from?.length !== 1) return false;
  const subselect = from[0].RangeSubselect as Node | undefined;
  if ((subselect?.alias as Node | undefined)?.aliasname !== "agent_q") return false;

  return canonical(subselect?.subquery) === canonical(validatedStatement);
}

/** As posicoes mudam com o embrulho; o resto da arvore tem que ser identico. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, child) => {
    if (key === "location" || key === "stmt_location" || key === "stmt_len") return undefined;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return Object.fromEntries(Object.entries(child as Node).sort(([a], [b]) => a.localeCompare(b)));
    }
    return child;
  });
}
