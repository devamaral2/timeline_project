import type { IdempotencyClaim, IdempotencyKeyRef, IdempotencyStore } from "../../../domain/ports";
import { idempotencyKeys } from "../database/tables";
import { c, rowDecoder } from "../sqlite/columns";
import type { Db } from "../sqlite/database";
import { NOW, sql } from "../sqlite/sql";

/** Chaves antigas saem na proxima reserva; a janela e a de qualquer automacao diaria com folga. */
const RETENTION = "-30 days";
/** Reserva sem resposta por mais que isto e de uma execucao que morreu: pode ser retomada. */
const STALE_CLAIM = "-2 minutes";

/** O instante `modifier` antes de agora, no formato das colunas de data e hora. */
const ago = (modifier: string) => sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${modifier})`;

const existingRow = rowDecoder({
  requestHash: idempotencyKeys.columns.requestHash,
  response: c.json<unknown>().nullable(),
});

/** Tempo medido pelo relogio do banco (`strftime('now')`), como o store dos tickets. */
export class SqliteIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Db) {}

  async claim(input: IdempotencyKeyRef & { requestHash: string }): Promise<IdempotencyClaim> {
    await this.db.execute(sql`DELETE FROM idempotency_keys WHERE created_at < ${ago(RETENTION)}`);
    // Duas tentativas: a linha pode ser liberada entre o INSERT e o SELECT.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await this.db.execute(sql`
        INSERT INTO idempotency_keys (user_id, scope, key, request_hash)
        VALUES (${input.userId}, ${input.scope}, ${input.key}, ${input.requestHash})
        ON CONFLICT DO NOTHING
        RETURNING key`);
      if (inserted.rows.length > 0) return { kind: "claimed" };

      const revived = await this.db.execute(sql`
        UPDATE idempotency_keys SET created_at = ${NOW}
        WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}
          AND response IS NULL AND request_hash = ${input.requestHash}
          AND created_at < ${ago(STALE_CLAIM)}
        RETURNING key`);
      if (revived.rows.length > 0) return { kind: "claimed" };

      // Pelo escritor: a leitura enxerga o que acabou de ser gravado, sem depender do leitor.
      const existing = await this.db.execute(sql`
        SELECT request_hash AS "requestHash", response FROM idempotency_keys
        WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}`, existingRow);
      const row = existing.rows[0];
      if (!row) continue;
      if (row.requestHash !== input.requestHash) return { kind: "mismatch" };
      if (row.response !== null && row.response !== undefined) return { kind: "replay", response: row.response };
      return { kind: "in_progress" };
    }
    return { kind: "in_progress" };
  }

  async complete(input: IdempotencyKeyRef & { response: unknown }): Promise<void> {
    await this.db.execute(sql`
      UPDATE idempotency_keys SET response = ${sql.json(input.response)}
      WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}`);
  }

  async release(input: IdempotencyKeyRef): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM idempotency_keys
      WHERE user_id = ${input.userId} AND scope = ${input.scope} AND key = ${input.key}
        AND response IS NULL`);
  }
}
