import { z } from "zod";
import { EVENT_PRIORITIES, type EventKind, type EventReviseChanges } from "../../../domain";
import type { CreateEventInput, CreateNoteInput } from "@repo/contracts";
import { isoInstant, parseInstant } from "./agent-skill";

/** Campos de todo evento. Com `id` a chamada altera um evento existente; sem, cria. */
export const eventBaseFields = {
  id: z
    .string()
    .min(1)
    .optional()
    .describe("Id de um evento existente para ALTERAR (obtido por query_data). Omita para criar."),
  name: z.string().min(1).optional().describe("Nome curto, com inicial maiúscula."),
  description: z.string().optional().describe("Observação livre. Omita se não houver."),
  tags: z
    .array(z.string())
    .optional()
    .describe("Etiquetas curtas em minúsculas. Numa alteração, substituem as atuais."),
  startedAt: isoInstant.optional().describe("Início, ISO-8601 com fuso. Na criação, omita para 'agora'."),
  finishedAt: isoInstant.optional().describe("Fim, ISO-8601 com fuso. Omita se o usuário não disse."),
  missed: z
    .boolean()
    .optional()
    .describe("true só quando o usuário disser que não fez ou perdeu o evento."),
  priority: z.enum(EVENT_PRIORITIES).optional(),
};

const baseSchema = z.object(eventBaseFields);
type EventBaseArgs = z.infer<typeof baseSchema>;

/** `note`: a note que o evento nasce com, quando o tipo tem uma (refeicao, sono, treino). */
export function toCreateEventInput(args: EventBaseArgs, kind: EventKind, note?: CreateNoteInput): CreateEventInput {
  const input: CreateEventInput = { kind };
  if (note) input.notes = [note];
  if (args.name) input.name = args.name;
  if (args.description) input.description = args.description;
  if (args.tags?.length) input.tags = args.tags;
  if (args.startedAt) input.startedAt = args.startedAt;
  if (args.finishedAt) input.finishedAt = args.finishedAt;
  if (args.missed !== undefined) input.missed = args.missed;
  if (args.priority) input.priority = args.priority;
  return input;
}

export function toBaseChanges(args: EventBaseArgs): EventReviseChanges {
  return {
    name: args.name,
    description: args.description,
    tags: args.tags,
    startedAt: parseInstant(args.startedAt, "startedAt"),
    finishedAt: parseInstant(args.finishedAt, "finishedAt"),
    missed: args.missed,
    priority: args.priority,
  };
}
