import { inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { EventValidationError, type WorkoutCode } from "@repo/entities";
import type { WorkoutCatalog, WorkoutDefinition } from "@repo/entities/ports";
import * as schema from "../database/schema";

export class PostgresWorkoutCatalog implements WorkoutCatalog {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]> {
    if (codes.length === 0) return [];

    const rows = await this.db
      .select()
      .from(schema.workout)
      .where(inArray(schema.workout.code, [...codes]));

    const byCode = new Map(rows.map((row) => [row.code, row]));

    return codes.map((code) => {
      const row = byCode.get(code);
      if (!row || !row.active) {
        throw new EventValidationError(`Unknown or inactive workout code: ${code}`);
      }
      return {
        code: row.code as WorkoutCode,
        name: row.name,
        category: row.category as WorkoutDefinition["category"],
        active: row.active,
      };
    });
  }
}
