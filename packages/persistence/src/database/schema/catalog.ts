import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { catalogScopeEnum } from "./enums";

export const food = pgTable(
  "food",
  {
    id: char("id", { length: 26 }).primaryKey(),
    scope: catalogScopeEnum("scope").notNull(),
    ownerUserId: text("owner_user_id"),
    revision: integer("revision").notNull().default(1),
    name: text("name").notNull(),
    referencePortion: text("reference_portion").notNull(),
    referenceWeightGrams: numeric("reference_weight_grams", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
    caloriesKcal: numeric("calories_kcal", { precision: 10, scale: 2, mode: "number" }).notNull(),
    carbohydratesGrams: numeric("carbohydrates_grams", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
    proteinsGrams: numeric("proteins_grams", { precision: 10, scale: 2, mode: "number" }).notNull(),
    totalFatGrams: numeric("total_fat_grams", { precision: 10, scale: 2, mode: "number" }).notNull(),
    fiberGrams: numeric("fiber_grams", { precision: 10, scale: 2, mode: "number" }).notNull(),
    micronutrients: jsonb("micronutrients").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("food_global_name_idx").on(table.name).where(sql`${table.scope} = 'global'`),
    index("food_owner_name_idx")
      .on(table.ownerUserId, table.name)
      .where(sql`${table.scope} = 'user'`),
    check(
      "food_scope_owner",
      sql`(${table.scope} = 'global' AND ${table.ownerUserId} IS NULL) OR (${table.scope} = 'user' AND ${table.ownerUserId} IS NOT NULL)`,
    ),
    check("food_micronutrients_is_object", sql`jsonb_typeof(${table.micronutrients}) = 'object'`),
    check("food_revision_min", sql`${table.revision} >= 1`),
    check(
      "food_nutrition_nonnegative",
      sql`${table.referenceWeightGrams} >= 0 AND ${table.caloriesKcal} >= 0 AND ${table.carbohydratesGrams} >= 0 AND ${table.proteinsGrams} >= 0 AND ${table.totalFatGrams} >= 0 AND ${table.fiberGrams} >= 0`,
    ),
  ],
);

export const meal = pgTable(
  "meal",
  {
    id: char("id", { length: 26 }).primaryKey(),
    scope: catalogScopeEnum("scope").notNull(),
    ownerUserId: text("owner_user_id"),
    revision: integer("revision").notNull().default(1),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    foodItems: jsonb("food_items").notNull().default([]),
    totalCaloriesKcal: numeric("total_calories_kcal", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    totalProteinGrams: numeric("total_protein_grams", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    totalCarbohydrateGrams: numeric("total_carbohydrate_grams", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    totalFatGrams: numeric("total_fat_grams", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    totalFiberGrams: numeric("total_fiber_grams", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("meal_global_name_idx").on(table.name).where(sql`${table.scope} = 'global'`),
    index("meal_owner_name_idx")
      .on(table.ownerUserId, table.name)
      .where(sql`${table.scope} = 'user'`),
    check(
      "meal_scope_owner",
      sql`(${table.scope} = 'global' AND ${table.ownerUserId} IS NULL) OR (${table.scope} = 'user' AND ${table.ownerUserId} IS NOT NULL)`,
    ),
    check("meal_food_items_is_array", sql`jsonb_typeof(${table.foodItems}) = 'array'`),
    check("meal_revision_min", sql`${table.revision} >= 1`),
    check(
      "meal_totals_nonnegative",
      sql`${table.totalCaloriesKcal} >= 0 AND ${table.totalProteinGrams} >= 0 AND ${table.totalCarbohydrateGrams} >= 0 AND ${table.totalFatGrams} >= 0 AND ${table.totalFiberGrams} >= 0`,
    ),
  ],
);

export const workout = pgTable("workout", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("workout_category_known", sql`${table.category} IN ('cardio', 'strength', 'free')`),
]);
