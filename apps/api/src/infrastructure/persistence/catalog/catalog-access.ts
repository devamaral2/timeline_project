import { eq, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

interface ScopedTable {
  scope: PgColumn;
  ownerUserId: PgColumn;
}

/** Predicado de visibilidade comum a Food e Meal: publico ou privado do proprio ator. */
export function visibilityCondition(table: ScopedTable, actorUserId: string) {
  return or(eq(table.scope, "global"), eq(table.ownerUserId, actorUserId));
}
