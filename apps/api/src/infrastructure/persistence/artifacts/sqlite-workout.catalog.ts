import { ArtifactValidationError, type WorkoutCategory, type WorkoutCode } from "../../../domain";
import type { WorkoutCatalog, WorkoutDefinition } from "../../../domain/ports";
import { c, rowDecoder } from "../sqlite/columns";
import { sql } from "../sqlite/sql";
import type { Db } from "../shared/tx";

const workoutRow = rowDecoder({
  name: c.text,
  code: c.text,
  category: c.text,
  active: c.boolean,
});

/** Os exercicios sao artefatos globais do tipo `workout`, lidos pelo codigo. */
export class SqliteWorkoutCatalog implements WorkoutCatalog {
  constructor(private readonly db: Db) {}

  async findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]> {
    if (codes.length === 0) return [];

    // `->>` de um booleano JSON devolve 1 ou 0; sem o campo, NULL, e o exercicio conta como ativo.
    const rows = await this.db.all(
      sql`
        SELECT name, data ->> 'code' AS code, data ->> 'category' AS category,
               coalesce(data ->> 'active', 1) AS active
        FROM artifacts
        WHERE type = 'workout' AND user_id IS NULL AND deleted_at IS NULL
          AND data ->> 'code' IN ${sql.in([...new Set(codes)])}`,
      workoutRow,
    );
    const byCode = new Map(rows.map((row) => [row.code, row]));

    return codes.map((code) => {
      const row = byCode.get(code);
      if (!row?.active) {
        throw new ArtifactValidationError(`Unknown or inactive workout code: ${code}`);
      }
      return { code, name: row.name, category: row.category as WorkoutCategory, active: row.active };
    });
  }
}
