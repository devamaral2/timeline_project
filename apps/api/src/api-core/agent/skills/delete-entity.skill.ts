import { z } from "zod";
import { skillText } from "../config/agent-config";
import { defineAgentSkill } from "./agent-skill";

export const deleteEntitySkill = defineAgentSkill({
  name: "delete_entity",
  ...skillText("delete_entity"),
  parameters: z.object({
    kind: z.enum(["event", "task", "note"]),
    id: z.string().min(1).describe("Id obtido por query_data."),
  }),
  run: async (args, { session }) => session.delete(args.kind, args.id),
});
