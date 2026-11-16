import { char, check, index, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { artifacts } from "./artifacts";
import { events } from "./events";

export const tags = pgTable(
  "tags",
  {
    id: char("id", { length: 26 }).primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tags_user_name_unique").on(table.userId, table.name),
    // Sugestao por prefixo: `LIKE 'x%'`.
    index("tags_user_name_prefix_idx").on(table.userId, table.name.op("text_pattern_ops")),
    check("tag_name_normalized", sql`${table.name} = lower(btrim(${table.name})) AND ${table.name} <> ''`),
  ],
);

export const eventTags = pgTable(
  "task_tags",
  {
    eventId: char("task_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagId: char("tag_id", { length: 26 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index("task_tags_tag_idx").on(table.tagId, table.eventId),
  ],
);

export const artifactTags = pgTable(
  "artifact_tags",
  {
    artifactId: char("artifact_id", { length: 26 })
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    tagId: char("tag_id", { length: 26 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.artifactId, table.tagId] }),
    index("artifact_tags_tag_idx").on(table.tagId, table.artifactId),
  ],
);
