import { ulid } from "ulid";
import { EventValidationError } from "../../events/errors/event.errors";
import { calculateMealTotals, type MealItem, type MealTotals } from "../../events/items/meal-item";
import type { FoodItem } from "../../events/items/food-item";
import type { CatalogScope } from "../types/catalog-scope";

export interface MealProps {
  id?: string;
  scope: CatalogScope;
  ownerUserId?: string;
  name: string;
  description: string;
  foodItems: FoodItem[];
  revision?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MealReviseChanges {
  name?: string;
  description?: string;
  foodItems?: FoodItem[];
}

export class Meal {
  readonly id: string;
  readonly scope: CatalogScope;
  readonly ownerUserId?: string;
  readonly name: string;
  readonly description: string;
  readonly foodItems: FoodItem[];
  readonly totals: MealTotals;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    id: string;
    scope: CatalogScope;
    ownerUserId?: string;
    name: string;
    description: string;
    foodItems: FoodItem[];
    totals: MealTotals;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.scope = props.scope;
    this.ownerUserId = props.ownerUserId;
    this.name = props.name;
    this.description = props.description;
    this.foodItems = props.foodItems;
    this.totals = props.totals;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: MealProps): Meal {
    if (props.scope === "global" && props.ownerUserId) {
      throw new EventValidationError("Global catalog entries cannot have an owner");
    }
    if (props.scope === "user" && !props.ownerUserId) {
      throw new EventValidationError("Private catalog entries require an owner");
    }

    const now = new Date();
    const foodItems = props.foodItems.map((item) => ({ ...item }));

    return new Meal({
      id: props.id ?? ulid(),
      scope: props.scope,
      ownerUserId: props.ownerUserId,
      name: props.name,
      description: props.description,
      foodItems,
      totals: calculateMealTotals(foodItems),
      revision: props.revision ?? 1,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  revise(changes: MealReviseChanges): Meal {
    return Meal.create({
      id: this.id,
      scope: this.scope,
      ownerUserId: this.ownerUserId,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      foodItems: changes.foodItems ?? this.foodItems,
      revision: this.revision + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  toMealItem(): MealItem {
    return {
      sourceMealId: this.id,
      sourceMealRevision: this.revision,
      name: this.name,
      description: this.description,
      foodItems: this.foodItems.map((item) => ({ ...item, id: ulid() })),
      totals: { ...this.totals },
    };
  }
}
