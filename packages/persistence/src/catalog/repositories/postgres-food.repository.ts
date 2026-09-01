import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  CatalogNotFoundError,
  CatalogReadOnlyError,
  CatalogRevisionConflictError,
  type Food,
} from "@repo/entities";
import type { FoodRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { mapFoodRow } from "../mappers/food-row.mapper";
import { visibilityCondition } from "../catalog-access";

export class PostgresFoodRepository implements FoodRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(food: Food, actorUserId: string): Promise<void> {
    if (food.scope !== "user") {
      throw new CatalogReadOnlyError("Only private catalog entries can be written through this port");
    }
    if (food.ownerUserId !== actorUserId) {
      throw new CatalogNotFoundError(`Food not found: ${food.id}`);
    }

    await this.db.insert(schema.food).values({
      id: food.id,
      scope: food.scope,
      ownerUserId: food.ownerUserId,
      revision: food.revision,
      name: food.name,
      referencePortion: food.referencePortion,
      referenceWeightGrams: food.referenceWeightGrams,
      caloriesKcal: food.caloriesKcal,
      carbohydratesGrams: food.macronutrients.carbohydratesGrams,
      proteinsGrams: food.macronutrients.proteinsGrams,
      totalFatGrams: food.macronutrients.totalFatGrams,
      fiberGrams: food.macronutrients.fiberGrams,
      micronutrients: food.micronutrients,
    });
  }

  async update(food: Food, actorUserId: string, expectedRevision: number): Promise<void> {
    const result = await this.db
      .update(schema.food)
      .set({
        name: food.name,
        referencePortion: food.referencePortion,
        referenceWeightGrams: food.referenceWeightGrams,
        caloriesKcal: food.caloriesKcal,
        carbohydratesGrams: food.macronutrients.carbohydratesGrams,
        proteinsGrams: food.macronutrients.proteinsGrams,
        totalFatGrams: food.macronutrients.totalFatGrams,
        fiberGrams: food.macronutrients.fiberGrams,
        micronutrients: food.micronutrients,
        revision: food.revision,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.food.id, food.id),
          eq(schema.food.scope, "user"),
          eq(schema.food.ownerUserId, actorUserId),
          eq(schema.food.revision, expectedRevision),
        ),
      )
      .returning({ id: schema.food.id });

    if (result.length > 0) return;

    await this.classifyUpdateFailure(food.id, actorUserId, expectedRevision);
  }

  async findVisibleById(id: string, actorUserId: string): Promise<Food | null> {
    const [row] = await this.db
      .select()
      .from(schema.food)
      .where(and(eq(schema.food.id, id), visibilityCondition(schema.food, actorUserId)));

    if (!row) return null;
    return mapFoodRow(row);
  }

  private async classifyUpdateFailure(
    id: string,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<never> {
    const [existing] = await this.db
      .select({ scope: schema.food.scope, ownerUserId: schema.food.ownerUserId, revision: schema.food.revision })
      .from(schema.food)
      .where(eq(schema.food.id, id));

    if (!existing) {
      throw new CatalogNotFoundError(`Food not found: ${id}`);
    }
    if (existing.scope === "global") {
      throw new CatalogReadOnlyError("Global catalog entries are read-only through this port");
    }
    if (existing.ownerUserId !== actorUserId) {
      throw new CatalogNotFoundError(`Food not found: ${id}`);
    }
    throw new CatalogRevisionConflictError(
      `Expected revision ${expectedRevision} but found ${existing.revision}`,
    );
  }
}
