import { z } from "zod";
import { defineAgentSkill } from "./agent-skill";

export const deleteEntitySkill = defineAgentSkill({
  name: "delete_entity",
  progressLabel: "Preparando exclusão",
  description: "Apaga um evento, uma tarefa ou uma nota pelo id.",
  instructions: [
    "delete_entity — só quando o usuário pedir para apagar. Apagar uma tarefa apaga as",
    "subtarefas e as notas dela; apagar um evento apaga as notas dele.",
  ].join("\n"),
  parameters: z.object({
    kind: z.enum(["event", "task", "note"]),
    id: z.string().min(1).describe("Id obtido por query_data."),
  }),
  run: async (args, { session }) => session.delete(args.kind, args.id),
});
