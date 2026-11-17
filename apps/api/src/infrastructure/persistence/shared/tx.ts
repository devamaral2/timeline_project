import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../database/schema";

export type Db = NodePgDatabase<typeof schema>;

/** A transacao que os agregados compartilham: tudo o que um caso de uso grava entra numa so. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Serializa, por usuario, as escritas que precisam enxergar umas as outras: a
 * geracao de ocorrencias de uma serie e a conferencia de ciclos nas relacoes.
 */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
}
