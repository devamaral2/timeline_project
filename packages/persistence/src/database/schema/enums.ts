import { pgEnum } from "drizzle-orm/pg-core";

export const eventPriorityEnum = pgEnum("event_priority", ["urgent", "normal", "flexible"]);
export const catalogScopeEnum = pgEnum("catalog_scope", ["global", "user"]);
