import { char, check, index, primaryKey, pgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plans } from "./plans";

export const planDependencies = pgTable(
  "plan_dependencies",
  {
    planId: char("plan_id", { length: 26 })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    dependsOnPlanId: char("depends_on_plan_id", { length: 26 })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.dependsOnPlanId] }),
    index("plan_dependencies_reverse_idx").on(table.dependsOnPlanId, table.planId),
    check("plan_dependencies_no_self_reference", sql`${table.planId} <> ${table.dependsOnPlanId}`),
  ],
);
