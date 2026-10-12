import { z } from "zod";
import { isEventPriority, isWorkItemPriority } from "../../../domain";
import type { CreateRecurrenceInput, EventRecurrenceTemplate, TaskRecurrenceTemplate } from "@repo/contracts";
import type { Recurrence } from "../../../domain";
import type { RecurrenceRevision } from "../../recurrences/revise-recurrence";
import { promptsConfig, skillText } from "../config/agent-config";
import { defineAgentSkill, fail } from "./agent-skill";
import { buildRecurrenceRule, ruleArgsOf, WEEKDAY_CODES, type RecurrenceRuleArgs } from "./recurrence-rule";

const EVENT_KINDS = ["routine", "meal", "training", "sleep"] as const;
/** Eventos e tarefas tem escalas diferentes; `urgent` e comum. A checagem por alvo e feita em `run`. */
const PRIORITIES = ["urgent", "normal", "flexible", "high", "medium", "low"] as const;

const recurrenceParameters = z.object({
  id: z
    .string()
    .min(1)
    .optional()
    .describe("Id de uma série existente (tabela recurrences) para ALTERAR. Omita para criar."),
  target: z
    .enum(["event", "task"])
    .optional()
    .describe("O que a série gera: eventos na agenda ou tarefas. Obrigatório ao criar; não muda numa alteração."),
  name: z.string().min(1).optional().describe("Nome curto. Obrigatório, exceto para refeição, treino e sono."),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().describe("Etiquetas curtas em minúsculas."),
  kind: z
    .enum(EVENT_KINDS)
    .optional()
    .describe("Só para target event. Omita para rotina (trabalho, estudo, reunião, lazer…)."),
  inputText: z
    .string()
    .min(1)
    .optional()
    .describe("Só para kind meal: os alimentos com quantidades, como o usuário disse. Omita se não disse."),
  priority: z
    .enum(PRIORITIES)
    .optional()
    .describe("Evento: urgent | normal | flexible. Tarefa: urgent | high | medium | low."),
  parentTaskId: z.string().min(1).optional().describe("Só para tarefa: cada ocorrência nasce como subtarefa dela."),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional().describe("Obrigatório ao criar."),
  interval: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("A cada N períodos. Omita para 1 ('a cada 2 semanas' = weekly com interval 2)."),
  weekdays: z
    .array(z.enum(WEEKDAY_CODES))
    .optional()
    .describe("Só com weekly. Omita para o dia da semana de startsOn. 'Dias úteis' = mon,tue,wed,thu,fri."),
  monthDay: z.number().int().min(1).max(31).optional().describe("Só com monthly/yearly. Omita para o dia de startsOn."),
  month: z.number().int().min(1).max(12).optional().describe("Só com yearly. Omita para o mês de startsOn."),
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .describe("Hora de início, HH:MM no fuso do usuário, ex: 07:30. Obrigatório ao criar."),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Duração em MINUTOS. Numa tarefa, vira o prazo. Omita se o usuário não disse."),
  startsOn: z.iso.date().optional().describe("Primeiro dia possível, YYYY-MM-DD. Omita para hoje."),
  endsOn: z.iso.date().optional().describe("Último dia, YYYY-MM-DD. Omita se a série não termina."),
});

type RecurrenceArgs = z.infer<typeof recurrenceParameters>;

export const recurrenceSkill = defineAgentSkill({
  name: "save_recurrence",
  ...skillText("save_recurrence"),
  parameters: recurrenceParameters,
  run: async (args, { session }) => {
    const timeZone = promptsConfig.timeZone;
    if (args.id) return session.updateRecurrence(args.id, (current) => planUpdate(current, args, timeZone));

    if (!args.target) return fail("target é obrigatório para criar uma recorrência.");
    if (!args.frequency || !args.timeOfDay) return fail("frequency e timeOfDay são obrigatórios para criar uma recorrência.");
    const rule = buildRecurrenceRule(
      { ...args, frequency: args.frequency, timeOfDay: args.timeOfDay },
      session.todayIn(timeZone),
      timeZone,
    );

    if (args.target === "task") {
      const template = taskTemplateOf(args);
      if (!template.name) return fail("name é obrigatório para uma tarefa recorrente.");
      if (args.kind || args.inputText) return fail("kind e inputText só valem para target event.");
      return session.createRecurrence({ ...rule, target: "task", template } satisfies CreateRecurrenceInput);
    }

    if (args.parentTaskId) return fail("parentTaskId só vale para target task.");
    const kind = args.kind ?? "routine";
    if (kind === "routine" && !args.name) return fail("name é obrigatório para um evento de rotina recorrente.");
    return session.createRecurrence({
      ...rule, target: "event", template: eventTemplateOf(args, kind),
    } satisfies CreateRecurrenceInput);
  },
});

function taskTemplateOf(args: RecurrenceArgs): TaskRecurrenceTemplate {
  if (args.priority && !isWorkItemPriority(args.priority)) {
    throw new Error(`priority inválida para tarefa: ${args.priority}. Use urgent, high, medium ou low.`);
  }
  return {
    name: args.name,
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.tags?.length ? { tags: args.tags } : {}),
    ...(args.priority ? { priority: args.priority as TaskRecurrenceTemplate["priority"] } : {}),
    ...(args.parentTaskId ? { parentTaskId: args.parentTaskId } : {}),
  };
}

function eventTemplateOf(args: RecurrenceArgs, kind: (typeof EVENT_KINDS)[number]): EventRecurrenceTemplate {
  if (args.inputText && kind !== "meal") throw new Error("inputText só vale para kind meal.");
  if (args.priority && !isEventPriority(args.priority)) {
    throw new Error(`priority inválida para evento: ${args.priority}. Use urgent, normal ou flexible.`);
  }
  return {
    kind,
    ...(args.name ? { name: args.name } : {}),
    ...(args.description ? { description: args.description } : {}),
    ...(args.tags?.length ? { tags: args.tags } : {}),
    ...(args.priority ? { priority: args.priority as EventRecurrenceTemplate["priority"] } : {}),
    ...(kind === "meal" && args.inputText
      ? { notes: [{ type: "meal" as const, data: { inputText: args.inputText } }] }
      : {}),
  };
}

/**
 * Alteracao parcial: parte da serie como ela esta e muda so o que foi pedido.
 * Trocar a frequencia descarta o que era dela (dias da semana, dia do mes) e
 * o que falta volta a vir de `startsOn`, como numa serie nova.
 */
function planUpdate(current: Recurrence, args: RecurrenceArgs, timeZone: string): RecurrenceRevision {
  if (args.target && args.target !== current.target) {
    throw new Error(`A série gera ${current.target === "event" ? "eventos" : "tarefas"} e isso não muda: apague e crie outra.`);
  }
  const base = ruleArgsOf(current.rule);
  const frequency = args.frequency ?? base.frequency;
  const keepsFrequency = frequency === base.frequency;
  const merged: RecurrenceRuleArgs = {
    frequency,
    interval: args.interval ?? base.interval,
    weekdays: args.weekdays ?? (keepsFrequency ? base.weekdays : undefined),
    monthDay: args.monthDay ?? (frequency === "monthly" || frequency === "yearly" ? base.monthDay : undefined),
    month: args.month ?? (keepsFrequency ? base.month : undefined),
    timeOfDay: args.timeOfDay ?? base.timeOfDay,
    durationMinutes: args.durationMinutes ?? base.durationMinutes,
    startsOn: args.startsOn ?? base.startsOn,
    endsOn: args.endsOn ?? base.endsOn,
  };
  const full = buildRecurrenceRule(merged, current.rule.startsOn, timeZone);
  // Chaves ausentes de `full` viram `undefined`: o merge da entidade as removeria da regra.
  const rule = {
    byWeekday: undefined, byMonthDay: undefined, byMonth: undefined, durationMinutes: undefined, endsOn: undefined,
    ...full,
  };

  const touchesTemplate = [args.name, args.description, args.tags, args.priority, args.inputText, args.parentTaskId, args.kind]
    .some((value) => value !== undefined);
  if (!touchesTemplate) return { rule };

  if (current.target === "task") {
    if (args.kind || args.inputText) throw new Error("kind e inputText só valem para série de eventos.");
    const stored = current.template as { name?: string; description?: string; tags?: string[]; priority?: string; parentTaskId?: string };
    return {
      rule,
      template: taskTemplateOf({
        ...args,
        name: args.name ?? stored.name ?? "",
        description: args.description ?? stored.description,
        tags: args.tags ?? stored.tags,
        priority: (args.priority ?? stored.priority) as RecurrenceArgs["priority"],
        parentTaskId: args.parentTaskId ?? stored.parentTaskId,
      }),
    };
  }

  if (args.parentTaskId) throw new Error("parentTaskId só vale para série de tarefas.");
  const stored = current.template as { kind: (typeof EVENT_KINDS)[number]; name?: string; description?: string; tags?: string[]; priority?: string };
  if (args.kind && args.kind !== stored.kind) {
    throw new Error(`O tipo do evento da série (${stored.kind}) não muda: apague e crie outra.`);
  }
  return {
    rule,
    // As notes da serie (a refeicao de um almoco fixo) ficam, a menos que `inputText` as troque.
    keepNotes: true,
    template: eventTemplateOf({
      ...args,
      name: args.name ?? stored.name,
      description: args.description ?? stored.description,
      tags: args.tags ?? stored.tags,
      priority: (args.priority ?? stored.priority) as RecurrenceArgs["priority"],
    }, stored.kind),
  };
}
