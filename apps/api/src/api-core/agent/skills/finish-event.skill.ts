import { z } from "zod";
import { skillText } from "../config/agent-config";
import { defineAgentSkill, isoInstant, parseInstant } from "./agent-skill";

/** Encerra um evento de qualquer tipo; o servidor reorganiza quem vinha depois. */
export const finishEventSkill = defineAgentSkill({
  name: "finish_event",
  ...skillText("finish_event"),
  parameters: z.object({
    id: z.string().min(1).describe("Id do evento a encerrar, obtido em get_day_context."),
    finishedAt: isoInstant.optional().describe("Fim, ISO-8601 com fuso. Omita quando o usuário disse 'agora' ou não disse a hora."),
  }),
  run: async (args, { session }) => session.finishEvent(args.id, parseInstant(args.finishedAt, "finishedAt")),
});
