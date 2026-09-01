import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventPriorityEnum } from "./enums";

export const events = pgTable(
  "events",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    missed: boolean("missed").notNull().default(false),
    priority: eventPriorityEnum("priority").notNull().default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedOn: date("started_on")
      .notNull()
      .generatedAlwaysAs(
        sql`((started_at AT TIME ZONE 'America/Sao_Paulo')::date)`,
      ),
  },
  (table) => [
    index("events_timeline_cursor_idx").on(
      table.userId,
      table.startedAt.desc(),
      table.id.desc(),
    ),
    index("events_user_finished_idx")
      .on(table.userId, table.finishedAt)
      .where(sql`${table.finishedAt} IS NOT NULL`),
    index("events_user_day_idx").on(table.userId, table.startedOn),
    check("events_revision_min", sql`${table.revision} >= 1`),
    check(
      "events_finished_after_started",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const eventItems = pgTable(
  "event_items",
  {
    id: char("id", { length: 26 }).primaryKey(),
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    data: jsonb("data").notNull(),
  },
  (table) => [
    unique("event_items_event_position_unique").on(table.eventId, table.position),
    uniqueIndex("event_items_one_primary_idx")
      .on(table.eventId)
      .where(sql`${table.isPrimary}`),
    index("event_items_type_event_idx").on(table.type, table.eventId),
    check("event_item_position_nonneg", sql`${table.position} >= 0`),
    check("event_item_schema_version_min", sql`${table.schemaVersion} >= 1`),
    check("event_item_data_is_object", sql`jsonb_typeof(${table.data}) = 'object'`),
  ],
);

export const eventInterruptions = pgTable(
  "event_interruptions",
  {
    id: char("id", { length: 26 }).primaryKey(),
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("event_interruptions_event_position_unique").on(table.eventId, table.position),
    index("event_interruptions_event_idx").on(table.eventId, table.position),
    check("event_interruptions_position_nonneg", sql`${table.position} >= 0`),
    check(
      "interruption_finished_after_started",
      sql`${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);

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
    index("tags_user_name_prefix_idx").on(table.userId, table.name.op("text_pattern_ops")),
    check(
      "tag_name_normalized",
      sql`${table.name} = lower(btrim(${table.name})) AND ${table.name} <> ''`,
    ),
  ],
);

export const eventTags = pgTable(
  "event_tags",
  {
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagId: char("tag_id", { length: 26 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index("event_tags_tag_idx").on(table.tagId, table.eventId),
  ],
);
