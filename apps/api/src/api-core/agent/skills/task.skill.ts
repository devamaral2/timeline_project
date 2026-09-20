import { z } from "zod";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES } from "../../../domain";
import { defineAgentSkill, fail, isoInstant, parseInstant } from "./agent-skill";

export const taskSkill = defineAgentSkill({
  name: "save_task",
  progressLabel: "Preparando tarefa",
  description: "Cria ou altera uma tarefa ou subtarefa.",
  instructions: [
    "save_task — subtarefa é uma tarefa com parentTaskId. 'Crie a subtarefa X' na tela de uma",
    "tarefa: crie uma tarefa nova com parentTaskId = id da tarefa da tela.",
    "Com id, só os campos enviados mudam. Marcar como feita é status 'done'.",
  ].join("\n"),
  parameters: z.object({
    id: z
      .string()
      .min(1)
      .optional()
      .describe("Id de uma tarefa existente para ALTERAR (obtido por query_data). Omita para criar."),
    name: z.string().min(1).optional().describe("Nome da tarefa. Obrigatório na criação."),
    description: z.string().optional(),
    status: z.enum(WORK_ITEM_STATUSES).optional(),
    priority: z.enum(WORK_ITEM_PRIORITIES).optional(),
    parentTaskId: z.string().min(1).optional().describe("Tarefa pai, para criar ou mover como subtarefa."),
    tags: z.array(z.string()).optional().describe("Etiquetas curtas em minúsculas."),
    startedAt: isoInstant.optional(),
    estimatedFinishAt: isoInstant.optional().describe("Prazo, ISO-8601 com fuso."),
    finishedAt: isoInstant.optional(),
  }),
  run: async (args, { session }) => {
    const dates = {
      startedAt: parseInstant(args.startedAt, "startedAt"),
      estimatedFinishAt: parseInstant(args.estimatedFinishAt, "estimatedFinishAt"),
      finishedAt: parseInstant(args.finishedAt, "finishedAt"),
    };

    if (!args.id) {
      if (!args.name) return fail("name é obrigatório para criar uma tarefa.");
      return session.createTask({
        name: args.name,
        description: args.description,
        status: args.status,
        priority: args.priority,
        parentTaskId: args.parentTaskId,
        tags: args.tags,
        ...dates,
      });
    }

    return session.updateTask(args.id, {
      name: args.name,
      description: args.description,
      status: args.status,
      priority: args.priority,
      parentTaskId: args.parentTaskId,
      tags: args.tags,
      ...dates,
    });
  },
});
