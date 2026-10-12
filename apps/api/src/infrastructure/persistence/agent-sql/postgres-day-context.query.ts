import type { Pool } from "pg";
import { z } from "zod";
import type { DayContext, DayContextQuery } from "../../../api-core/agent/day-context.query";
import { DAY_CONTEXT_SQL } from "./day-context.sql";

const dayContextSchema = z.object({
  date: z.string(),
  timeZone: z.string(),
  events: z.array(z.object({
    id: z.string(), name: z.string(), started_at: z.string(), finished_at: z.string().nullable(),
    recurrence_id: z.string().nullable(), taskIds: z.array(z.string()),
  }).passthrough()),
  tasks: z.array(z.object({ id: z.string() }).passthrough()),
  notes: z.array(z.object({ id: z.string() }).passthrough()),
});

export class PostgresDayContextQuery implements DayContextQuery {
  constructor(private readonly pool: Pool) {}

  async get(input: { userId: string; date: string }): Promise<DayContext> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      await client.query("SET LOCAL statement_timeout = 3000");
      const result = await client.query<{ day_context: unknown }>(DAY_CONTEXT_SQL, [input.userId, input.date]);
      return dayContextSchema.parse(result.rows[0]?.day_context) as DayContext;
    } finally {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      client.release(broken);
    }
  }
}
