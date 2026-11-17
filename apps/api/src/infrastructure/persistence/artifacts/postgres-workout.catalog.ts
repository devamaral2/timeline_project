import { sql } from "drizzle-orm";
import { ArtifactValidationError, type WorkoutCategory, type WorkoutCode } from "../../../domain";
import type { WorkoutCatalog, WorkoutDefinition } from "../../../domain/ports";
import type { Db } from "../shared/tx";

interface WorkoutRow extends Record<string, unknown> {
  name: string;
  code: string;
  category: string;
  active: boolean;
}

/** Os exercicios sao artefatos globais do tipo `workout`, lidos pelo codigo. */
export class PostgresWorkoutCatalog implements WorkoutCatalog {
  constructor(private readonly db: Db) {}

  async findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]> {
    if (codes.length === 0) return [];

    const result = await this.db.execute<WorkoutRow>(sql`
      SELECT name, data->>'code' AS code, data->>'category' AS category,
             coalesce((data->>'active')::boolean, true) AS active
      FROM artifacts
      WHERE type = 'workout' AND user_id IS NULL AND deleted_at IS NULL
        AND data->>'code' IN ${[...new Set(codes)]}
    `);
    const byCode = new Map(result.rows.map((row) => [row.code, row]));

    return codes.map((code) => {
      const row = byCode.get(code);
      if (!row?.active) {
        throw new ArtifactValidationError(`Unknown or inactive workout code: ${code}`);
      }
      return { code, name: row.name, category: row.category as WorkoutCategory, active: row.active };
    });
  }
}
