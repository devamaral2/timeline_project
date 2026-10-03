import { z } from "zod";
import { defineAgentSkill } from "./agent-skill";

export const noteSkill = defineAgentSkill({
  name: "save_note",
  progressLabel: "Preparando nota",
  description: "Cria ou altera uma nota de texto, solta ou ligada a um evento ou a uma tarefa.",
  instructions: [
    "save_note — para observações que não são evento nem tarefa. Ligue a nota ao evento ou à",
    "tarefa quando o usuário se referir a um (ou à tela em que ele está); uma nota pode aparecer",
    "em vários eventos e tarefas, e ligar de novo a quem já a tem não faz nada.",
  ].join("\n"),
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
