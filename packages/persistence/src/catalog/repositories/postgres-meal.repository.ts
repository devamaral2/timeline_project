import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  CatalogNotFoundError,
  CatalogReadOnlyError,
  CatalogRevisionConflictError,
  type Meal,
} from "@repo/entities";
import type { MealRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { mapMealRow } from "../mappers/meal-row.mapper";
import { visibilityCondition } from "../catalog-access";

export class PostgresMealRepository implements MealRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(meal: Meal, actorUserId: string): Promise<void> {
    if (meal.scope !== "user") {
      throw new CatalogReadOnlyError("Only private catalog entries can be written through this port");
    }
    if (meal.ownerUserId !== actorUserId) {
      throw new CatalogNotFoundError(`Meal not found: ${meal.id}`);
    }

    await this.db.insert(schema.meal).values({
      id: meal.id,
      scope: meal.scope,
      ownerUserId: meal.ownerUserId,
      revision: meal.revision,
      name: meal.name,
      description: meal.description,
      foodItems: meal.foodItems,
      totalCaloriesKcal: meal.totals.totalCaloriesKcal,
      totalProteinGrams: meal.totals.totalProteinGrams,
      totalCarbohydrateGrams: meal.totals.totalCarbohydrateGrams,
      totalFatGrams: meal.totals.totalFatGrams,
      totalFiberGrams: meal.totals.totalFiberGrams,
    });
  }

  async update(meal: Meal, actorUserId: string, expectedRevision: number): Promise<void> {
    const result = await this.db
      .update(schema.meal)
      .set({
        name: meal.name,
        description: meal.description,
        foodItems: meal.foodItems,
        totalCaloriesKcal: meal.totals.totalCaloriesKcal,
        totalProteinGrams: meal.totals.totalProteinGrams,
        totalCarbohydrateGrams: meal.totals.totalCarbohydrateGrams,
        totalFatGrams: meal.totals.totalFatGrams,
        totalFiberGrams: meal.totals.totalFiberGrams,
        revision: meal.revision,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.meal.id, meal.id),
          eq(schema.meal.scope, "user"),
          eq(schema.meal.ownerUserId, actorUserId),
          eq(schema.meal.revision, expectedRevision),
        ),
      )
      .returning({ id: schema.meal.id });

    if (result.length > 0) return;

    await this.classifyUpdateFailure(meal.id, actorUserId, expectedRevision);
  }

  async findVisibleById(id: string, actorUserId: string): Promise<Meal | null> {
    const [row] = await this.db
      .select()
      .from(schema.meal)
      .where(and(eq(schema.meal.id, id), visibilityCondition(schema.meal, actorUserId)));

    if (!row) return null;
    return mapMealRow(row);
  }

  private async classifyUpdateFailure(
    id: string,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<never> {
    const [existing] = await this.db
      .select({ scope: schema.meal.scope, ownerUserId: schema.meal.ownerUserId, revision: schema.meal.revision })
      .from(schema.meal)
      .where(eq(schema.meal.id, id));

    if (!existing) {
      throw new CatalogNotFoundError(`Meal not found: ${id}`);
    }
    if (existing.scope === "global") {
      throw new CatalogReadOnlyError("Global catalog entries are read-only through this port");
    }
    if (existing.ownerUserId !== actorUserId) {
      throw new CatalogNotFoundError(`Meal not found: ${id}`);
    }
    throw new CatalogRevisionConflictError(
      `Expected revision ${expectedRevision} but found ${existing.revision}`,
    );
  }
}
