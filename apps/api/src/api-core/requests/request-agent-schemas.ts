import { z } from "zod";
import { HUMAN_KINDS, HUMAN_STATUSES, PRIORITIES } from "../../domain";

/**
 * O que cada agente devolve. Sem campo de esclarecimento, de proposito: o que o usuario nao disse
 * vem `null` e o servidor aplica o padrao. Os `.md` descrevem o mesmo formato ao modelo.
 */

const instant = z.string().nullable();
const tags = z.array(z.string()).default([]);
const kind = z.enum(HUMAN_KINDS);
const status = z.enum(HUMAN_STATUSES);
const priority = z.enum(PRIORITIES);
/** A posicao de outro item da mesma lista. */
const position = z.number().int().min(0);

export const eventCreateOutput = z.object({
  events: z.array(z.object({
    name: z.string().min(1),
    kind,
    /** `null` e o evento de referencia, que so marca um horario. */
    status: status.nullable(),
    priority: priority.nullable(),
    longRunning: z.boolean().nullable(),
    startedAt: instant,
    estimatedFinishAt: instant,
    description: z.string().nullable(),
    tags,
    /** O evento maior, desta mesma lista, de que este e uma parte. */
    subtaskOf: position.nullable().default(null),
    /** Os eventos desta mesma lista que precisam terminar antes deste. */
    blockedBy: z.array(position).default([]),
  })),
});

export const artifactCreateOutput = z.object({
  artifacts: z.array(z.object({
    type: z.enum(["text", "food"]),
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
    kind: kind.nullable(),
    status: status.nullable(),
    priority: priority.nullable(),
    startedAt: instant,
    estimatedFinishAt: instant,
    finishedAt: instant,
    description: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
  })),
  query: lookup,
});

export const artifactEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    content: z.string().min(1).nullable(),
    tags: z.array(z.string()).nullable(),
  })),
  query: lookup,
});

/**
 * Edicao pela tela de detalhe (ADR 006): o alvo e conhecido, entao nao ha `query`. O `id` e sempre o do alvo; o
 * servidor recusa qualquer outro. `null` e "nao muda".
 */
export const foodEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    /** O que foi comido, em texto; o servidor estima de novo itens, totais e receita a partir dele. */
    description: z.string().min(1).nullable(),
    tags: z.array(z.string()).nullable(),
  })),
});

export const sleepEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    /** Minutos dormidos. */
    trackedSleepTime: z.number().min(0).nullable(),
    score: z.number().min(0).max(100).nullable(),
    tags: z.array(z.string()).nullable(),
  })),
});

export const WORKOUT_CODES = ["walking", "treadmill", "running", "weightlifting", "free"] as const;

/** A lista de treinos vem COMPLETA (o que fica), nao so o que muda. */
export const trainingEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    tags: z.array(z.string()).nullable(),
    workouts: z.array(z.object({
      workoutCode: z.enum(WORKOUT_CODES),
      calories: z.number().min(0).nullable(),
      /** Minutos. */
      duration: z.number().min(0),
      /** min/km, so em caminhada, esteira e corrida. */
      pace: z.number().min(0).nullable(),
      /** km, so em caminhada, esteira e corrida. */
      distance: z.number().min(0).nullable(),
      /** So em musculacao. */
      sets: z.array(z.object({
        exercise: z.string().min(1), repetitions: z.number().min(0), weight: z.number().min(0),
      })).nullable(),
    })).nullable(),
  })),
});

/** O texto COMPLETO novo do arquivo da skill ou do agente do Hermes; o caminho e o do alvo, nunca do modelo. */
export const agentFileEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1).nullable(),
  })),
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
    kind,
    /** `null`: cada ocorrencia so marca um horario. Com status, cada uma e acompanhada. */
    status: status.nullable(),
    priority: priority.nullable(),
    description: z.string().nullable(),
    tags,
    ...cadence,
  })),
});

export const recurringEventEditOutput = z.object({
  edits: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).nullable(),
    description: z.string().nullable(),
    priority: priority.nullable(),
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
      "event-create", "artifact-create", "event-edit", "artifact-edit",
      "recurring-event-create", "recurring-event-edit", "query",
    ]),
    instruction: z.string().min(1),
  })).nullable(),
});

/** A ultima rodada do laco do fallback (`fallback:`): os especialistas estao desativados, so cabe a resposta. */
export const fallbackFinalOutput = z.object({ reply: z.string().min(1) });

/** Uma frase curta sobre o que falhou, so quando algum passo falhou. */
export const failureExplanationOutput = z.object({ message: z.string().min(1) });

export type EventCreateOutput = z.infer<typeof eventCreateOutput>;
export type ArtifactCreateOutput = z.infer<typeof artifactCreateOutput>;
export type RecurringEventCreateOutput = z.infer<typeof recurringEventCreateOutput>;
export type RecurringEventEditOutput = z.infer<typeof recurringEventEditOutput>;
export type FallbackOutput = z.infer<typeof fallbackOutput>;
export type FoodEditOutput = z.infer<typeof foodEditOutput>;
export type SleepEditOutput = z.infer<typeof sleepEditOutput>;
export type TrainingEditOutput = z.infer<typeof trainingEditOutput>;
export type AgentFileEditOutput = z.infer<typeof agentFileEditOutput>;
export type EventEditOutput = z.infer<typeof eventEditOutput>;
export type ArtifactEditOutput = z.infer<typeof artifactEditOutput>;
