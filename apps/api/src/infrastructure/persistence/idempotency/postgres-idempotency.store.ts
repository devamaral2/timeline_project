import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IdempotencyClaim, IdempotencyKeyRef, IdempotencyStore } from "../../../domain/ports";
import type * as schema from "../database/schema";

/** Chaves antigas saem na proxima reserva; a janela e a de qualquer automacao diaria com folga. */
const RETENTION = "30 days";
/** Reserva sem resposta por mais que isto e de uma execucao que morreu: pode ser retomada. */
const STALE_CLAIM = "2 minutes";

interface ExistingRow extends Record<string, unknown> {
  request_hash: string;
  response: unknown;
}

/** Tempo medido pelo relogio do banco, como o store dos tickets: replicas diferentes reservam e retomam. */
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async claim(input: IdempotencyKeyRef & { requestHash: string }): Promise<IdempotencyClaim> {
    await this.db.execute(sql`
      DELETE FROM idempotency_keys WHERE created_at < now() - ${RETENTION}::interval
    `);
    // Duas tentativas: a linha pode ser liberada entre o INSERT e o SELECT.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await this.db.execute(sql`
        INSERT INTO idempotency_keys (user_id, scope, key, request_hash)
        VALUES (${input.userId}, ${input.scope}, ${input.key}, ${input.requestHash})
        ON CONFLICT DO NOTHING
        RETURNING key
      `);
      if (inserted.rows.length > 0) return { kind: "claimed" };

      const revived = await this.db.execute(sql`
        UPDATE idempotency_keys SET created_at = now()
        WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}
          AND response IS NULL AND request_hash = ${input.requestHash}
          AND created_at < now() - ${STALE_CLAIM}::interval
        RETURNING key
      `);
      if (revived.rows.length > 0) return { kind: "claimed" };

      const existing = await this.db.execute<ExistingRow>(sql`
        SELECT request_hash, response FROM idempotency_keys
        WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}
      `);
      const row = existing.rows[0];
      if (!row) continue;
      if (row.request_hash !== input.requestHash) return { kind: "mismatch" };
      if (row.response !== null && row.response !== undefined) return { kind: "replay", response: row.response };
      return { kind: "in_progress" };
    }
    return { kind: "in_progress" };
  }

  async complete(input: IdempotencyKeyRef & { response: unknown }): Promise<void> {
    await this.db.execute(sql`
      UPDATE idempotency_keys SET response = ${JSON.stringify(input.response)}::jsonb
      WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}
    `);
  }

  async release(input: IdempotencyKeyRef): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM idempotency_keys
      WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}
        AND response IS NULL
    `);
  }
}
