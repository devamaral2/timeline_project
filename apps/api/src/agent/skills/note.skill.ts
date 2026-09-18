import { z } from "zod";
import { defineAgentSkill } from "./agent-skill";

export const noteSkill = defineAgentSkill({
  name: "save_note",
  progressLabel: "Preparando nota",
  description: "Cria ou altera uma nota livre, solta ou presa a um evento ou a uma tarefa.",
  instructions: [
    "save_note — para observações que não são evento nem tarefa. Prenda a nota ao evento ou à",
    "tarefa quando o usuário se referir a um (ou à tela em que ele está).",
  ].join("\n"),
  parameters: z.object({
    id: z
      .string()
      .min(1)
      .optional()
      .describe("Id de uma nota existente para ALTERAR (obtido por query_data). Omita para criar."),
    content: z.string().min(1).optional().describe("Texto da nota. Obrigatório na criação."),
    taskId: z.string().min(1).optional().describe("Tarefa a que a nota pertence."),
    eventId: z.string().min(1).optional().describe("Evento a que a nota pertence."),
  }),
  run: async (args, { session }) => {
    const fields = { content: args.content, taskId: args.taskId, eventId: args.eventId };
    return args.id ? session.updateNote(args.id, fields) : session.createNote(fields);
  },
});
