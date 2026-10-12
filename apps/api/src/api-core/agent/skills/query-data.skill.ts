import { z } from "zod";
import { skillText } from "../config/agent-config";
import { defineAgentSkill } from "./agent-skill";

export const queryDataSkill = defineAgentSkill({
  name: "query_data",
  ...skillText("query_data"),
  parameters: z.object({
    sql: z.string().min(1).describe("Um único SELECT."),
  }),
  run: async (args, { session, query, scope }) => query.run({ userId: session.userId, sql: args.sql, scope }),
});
