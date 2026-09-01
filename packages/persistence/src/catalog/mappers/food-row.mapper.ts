import { Food, type CatalogScope } from "@repo/entities";

export interface FoodRow {
  id: string;
  scope: CatalogScope;
  ownerUserId: string | null;
  revision: number;
  name: string;
  referencePortion: string;
  referenceWeightGrams: number;
  caloriesKcal: number;
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
  micronutrients: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export function mapFoodRow(row: FoodRow): Food {
  return Food.create({
    id: row.id,
    scope: row.scope,
    ownerUserId: row.ownerUserId ?? undefined,
    name: row.name,
    referencePortion: row.referencePortion,
    referenceWeightGrams: row.referenceWeightGrams,
    caloriesKcal: row.caloriesKcal,
    macronutrients: {
      carbohydratesGrams: row.carbohydratesGrams,
      proteinsGrams: row.proteinsGrams,
      totalFatGrams: row.totalFatGrams,
      fiberGrams: row.fiberGrams,
    },
    micronutrients: row.micronutrients as Record<string, number>,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
