import { z } from "zod";
import { skillText } from "../config/agent-config";
import { defineAgentSkill } from "./agent-skill";

export const noteSkill = defineAgentSkill({
  name: "save_note",
  ...skillText("save_note"),
  parameters: z.object({
    id: z
      .string()
      .min(1)
      .optional()
      .describe("Id de uma nota existente para ALTERAR (obtido por query_data). Omita para criar."),
    content: z.string().min(1).optional().describe("Texto da nota. Obrigatório na criação."),
    name: z.string().min(1).optional().describe("Título curto e substantivo. Omita para derivar do conteúdo."),
    taskId: z.string().min(1).optional().describe("Tarefa em que a nota passa a aparecer."),
    eventId: z.string().min(1).optional().describe("Evento em que a nota passa a aparecer."),
    tags: z.array(z.string()).optional().describe("Etiquetas curtas em minúsculas."),
  }),
  run: async (args, { session }) => {
    const fields = { name: args.name, content: args.content, taskId: args.taskId, eventId: args.eventId, tags: args.tags };
    return args.id ? session.updateNote(args.id, fields) : session.createNote(fields);
  },
});
