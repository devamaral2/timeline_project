import { z } from "zod";
import { EVENT_KINDS, WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES } from "../../domain";

/**
 * O que cada agente devolve. Sem campo de esclarecimento, de proposito: o que o usuario nao disse
 * vem `null` e o servidor aplica o padrao. Os `.md` descrevem o mesmo formato ao modelo.
 */

const instant = z.string().nullable();
const tags = z.array(z.string()).default([]);

export const eventCreateOutput = z.object({
  events: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(EVENT_KINDS),
    startedAt: instant,
    finishedAt: instant,
    description: z.string().nullable(),
    tags,
  })),
});

export const taskCreateOutput = z.object({
  tasks: z.array(z.object({
    name: z.string().min(1),
    description: z.string().nullable(),
    priority: z.enum(WORK_ITEM_PRIORITIES).nullable(),
    status: z.enum(WORK_ITEM_STATUSES).nullable(),
    tags,
    estimatedFinishAt: instant,
  })),
});

export const noteCreateOutput = z.object({
  notes: z.array(z.object({
    type: z.enum(["text", "meal"]),
    name: z.string().min(1),
    content: z.string().min(1),
  })),
});

/** Uma consulta de leitura que o agente de edicao pede quando nenhum candidato serve. */
const lookup = z.object({ sql: z.string().min(1) }).nullable();

export const eventEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    kind: z.enum(EVENT_KINDS).nullable(),
    startedAt: instant,
    finishedAt: instant,
    description: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
  })),
  query: lookup,
});

export const taskEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    description: z.string().nullable(),
    priority: z.enum(WORK_ITEM_PRIORITIES).nullable(),
    status: z.enum(WORK_ITEM_STATUSES).nullable(),
    tags: z.array(z.string()).nullable(),
    startedAt: instant,
    estimatedFinishAt: instant,
    finishedAt: instant,
  })),
  query: lookup,
});

export const noteEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    content: z.string().min(1).nullable(),
    tags: z.array(z.string()).nullable(),
  })),
  query: lookup,
});

/** O agente de consulta devolve exatamente uma consulta de leitura. */
export const queryOutput = z.object({ sql: z.string().min(1) });

const weekday = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

/** A cadencia de uma serie. Tudo o que o usuario nao disse vem `null` e o servidor aplica o padrao. */
const cadence = {
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).nullable(),
  weekdays: z.array(weekday).nullable(),
  monthDay: z.number().int().min(1).max(31).nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
};

/** Na edicao, a frequencia tambem pode nao mudar. */
const cadenceChanges = { ...cadence, frequency: cadence.frequency.nullable() };

export const recurringEventCreateOutput = z.object({
  series: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(EVENT_KINDS),
    description: z.string().nullable(),
    tags,
    ...cadence,
  })),
});

export const recurringTaskCreateOutput = z.object({
  series: z.array(z.object({
    name: z.string().min(1),
    description: z.string().nullable(),
    priority: z.enum(WORK_ITEM_PRIORITIES).nullable(),
    tags,
    ...cadence,
  })),
});

export const recurringEventEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    description: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    ...cadenceChanges,
  })),
  query: lookup,
});

export const recurringTaskEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    description: z.string().nullable(),
    priority: z.enum(WORK_ITEM_PRIORITIES).nullable(),
    tags: z.array(z.string()).nullable(),
    ...cadenceChanges,
  })),
  query: lookup,
});

/** O fallback ou responde, ou chama especialistas (nunca os dois, nunca ele mesmo). */
export const fallbackOutput = z.object({
  reply: z.string().min(1).nullable(),
  invoke: z.array(z.object({
    agent: z.enum([
      "event-create", "task-create", "note-create", "event-edit", "task-edit", "note-edit",
      "recurring-event-create", "recurring-task-create", "recurring-event-edit", "recurring-task-edit", "query",
    ]),
    instruction: z.string().min(1),
  })).nullable(),
});

/** Uma frase curta sobre o que falhou, so quando algum passo falhou. */
export const failureExplanationOutput = z.object({ message: z.string().min(1) });



export type EventCreateOutput = z.infer<typeof eventCreateOutput>;
export type TaskCreateOutput = z.infer<typeof taskCreateOutput>;
export type NoteCreateOutput = z.infer<typeof noteCreateOutput>;
export type RecurringEventCreateOutput = z.infer<typeof recurringEventCreateOutput>;
export type RecurringTaskCreateOutput = z.infer<typeof recurringTaskCreateOutput>;
export type RecurringEventEditOutput = z.infer<typeof recurringEventEditOutput>;
export type RecurringTaskEditOutput = z.infer<typeof recurringTaskEditOutput>;
export type FallbackOutput = z.infer<typeof fallbackOutput>;
export type EventEditOutput = z.infer<typeof eventEditOutput>;
export type TaskEditOutput = z.infer<typeof taskEditOutput>;
export type NoteEditOutput = z.infer<typeof noteEditOutput>;
