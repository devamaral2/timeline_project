import { ulid } from "ulid";
import { EventValidationError } from "../../events/errors/event.errors";
import type { FoodItem } from "../../events/items/food-item";
import type { CatalogScope } from "../types/catalog-scope";

export interface FoodMacronutrients {
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
}

export interface FoodProps {
  id?: string;
  scope: CatalogScope;
  ownerUserId?: string;
  name: string;
  referencePortion: string;
  referenceWeightGrams: number;
  caloriesKcal: number;
  macronutrients: FoodMacronutrients;
  micronutrients: Record<string, number>;
  revision?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FoodReviseChanges {
  name?: string;
  referencePortion?: string;
  referenceWeightGrams?: number;
  caloriesKcal?: number;
  macronutrients?: FoodMacronutrients;
  micronutrients?: Record<string, number>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class Food {
  readonly id: string;
  readonly scope: CatalogScope;
  readonly ownerUserId?: string;
  readonly name: string;
  readonly referencePortion: string;
  readonly referenceWeightGrams: number;
  readonly caloriesKcal: number;
  readonly macronutrients: FoodMacronutrients;
  readonly micronutrients: Record<string, number>;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: Required<Omit<FoodProps, "ownerUserId">> & { ownerUserId?: string }) {
    this.id = props.id;
    this.scope = props.scope;
    this.ownerUserId = props.ownerUserId;
    this.name = props.name;
    this.referencePortion = props.referencePortion;
    this.referenceWeightGrams = props.referenceWeightGrams;
    this.caloriesKcal = props.caloriesKcal;
    this.macronutrients = props.macronutrients;
    this.micronutrients = props.micronutrients;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: FoodProps): Food {
    if (props.scope === "global" && props.ownerUserId) {
      throw new EventValidationError("Global catalog entries cannot have an owner");
    }
    if (props.scope === "user" && !props.ownerUserId) {
      throw new EventValidationError("Private catalog entries require an owner");
    }

    const now = new Date();
    return new Food({
      id: props.id ?? ulid(),
      scope: props.scope,
      ownerUserId: props.ownerUserId,
      name: props.name,
      referencePortion: props.referencePortion,
      referenceWeightGrams: props.referenceWeightGrams,
      caloriesKcal: props.caloriesKcal,
      macronutrients: { ...props.macronutrients },
      micronutrients: { ...props.micronutrients },
      revision: props.revision ?? 1,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  revise(changes: FoodReviseChanges): Food {
    return Food.create({
      id: this.id,
      scope: this.scope,
      ownerUserId: this.ownerUserId,
      name: changes.name ?? this.name,
      referencePortion: changes.referencePortion ?? this.referencePortion,
      referenceWeightGrams: changes.referenceWeightGrams ?? this.referenceWeightGrams,
      caloriesKcal: changes.caloriesKcal ?? this.caloriesKcal,
      macronutrients: changes.macronutrients ?? this.macronutrients,
      micronutrients: changes.micronutrients ?? this.micronutrients,
      revision: this.revision + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  toFoodItem(portionProps: { portion: string; approximateWeightGrams: number }): FoodItem {
    const ratio = portionProps.approximateWeightGrams / this.referenceWeightGrams;

    return {
      id: ulid(),
      sourceFoodId: this.id,
      sourceFoodRevision: this.revision,
      name: this.name,
      portion: portionProps.portion,
      approximateWeightGrams: portionProps.approximateWeightGrams,
      caloriesKcal: round2(this.caloriesKcal * ratio),
      macronutrients: {
        carbohydratesGrams: round2(this.macronutrients.carbohydratesGrams * ratio),
        proteinsGrams: round2(this.macronutrients.proteinsGrams * ratio),
        totalFatGrams: round2(this.macronutrients.totalFatGrams * ratio),
        fiberGrams: round2(this.macronutrients.fiberGrams * ratio),
      },
      micronutrients: Object.fromEntries(
        Object.entries(this.micronutrients).map(([key, value]) => [key, round2(value * ratio)]),
      ),
    };
  }
}
