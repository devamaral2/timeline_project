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

/** Uma tarefa nova. */
const newTask = z.object({
  name: z.string().min(1),
  kind,
  /** `null` e a tarefa de referencia, que so marca um horario. */
  status: status.nullable(),
  priority: priority.nullable(),
  longRunning: z.boolean().nullable(),
  startedAt: instant,
  estimatedFinishAt: instant,
  description: z.string().nullable(),
  /** O lugar que o usuario disse, como ele disse: o servidor procura no mapa o endereco de um lugar que existe. */
  location: z.string().nullable().default(null),
  tags,
  /** A posicao, nesta mesma lista, da tarefa principal desta: ela e subtarefa daquela. */
  subtaskOf: position.nullable().default(null),
  /** Na refeicao, os alimentos e quantidades como o usuario disse: viram o alimento ligado a ela. */
  foods: z.string().nullable().default(null),
  /** Na refeicao, o titulo curto do que foi comido ("Feijoada"): o nome do alimento. */
  foodName: z.string().nullable().default(null),
});

/** Um artefato de texto novo. O alimento nao entra aqui: nasce com a refeicao, pelos `foods` da tarefa. */
const newArtifact = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  /** A tarefa NOVA desta resposta em que o artefato aparece: a posicao dela em `tasks`. */
  taskIndex: position.nullable().default(null),
  /** A tarefa que JA EXISTE em que o artefato aparece: o `id` de um candidato. */
  taskId: z.string().min(1).nullable().default(null),
});

/** Uma consulta de leitura que o agente de edicao pede quando nenhum candidato serve. */
const lookup = z.object({ sql: z.string().min(1) }).nullable();

/** Uma subtarefa nova de uma tarefa que ja existe: algo a fazer que e parte dela. O tipo e sempre `common`. */
const newSubtask = z.object({
  name: z.string().min(1),
  /** `null` e "a fazer" (`todo`): a subtarefa e uma parte a cumprir da tarefa maior. */
  status: status.nullable().default(null),
  priority: priority.nullable().default(null),
  startedAt: instant.default(null),
  estimatedFinishAt: instant.default(null),
  description: z.string().nullable().default(null),
});

const taskEdit = z.object({
  id: z.string().min(1),
  name: z.string().min(1).nullable(),
  kind: kind.nullable(),
  status: status.nullable(),
  priority: priority.nullable(),
  startedAt: instant,
  estimatedFinishAt: instant,
  finishedAt: instant,
  description: z.string().nullable(),
  /** O lugar novo, como o usuario disse (o servidor procura o endereco no mapa); `""` tira o local da tarefa. */
  location: z.string().nullable().default(null),
  tags: z.array(z.string()).nullable(),
  /** Tarefas novas que nascem como subtarefas desta, quando o pedido a divide em partes. Vazio na maioria dos pedidos. */
  subtasks: z.array(newSubtask).default([]),
});

const artifactEdit = z.object({
  id: z.string().min(1),
  name: z.string().min(1).nullable(),
  content: z.string().min(1).nullable(),
  tags: z.array(z.string()).nullable(),
});

/** A edicao de uma tarefa aberta na tela de detalhe (ADR 006): o alvo e conhecido, entao `query` vem sempre `null`. */
export const taskEditOutput = z.object({ edits: z.array(taskEdit), query: lookup });

/** A edicao de um artefato de texto aberto na tela de detalhe (ADR 006). */
export const artifactEditOutput = z.object({ edits: z.array(artifactEdit), query: lookup });

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

/** Uma serie nova. */
const newSeries = z.object({
  name: z.string().min(1),
  kind,
  /** `null`: cada ocorrencia so marca um horario. Com status, cada uma e acompanhada. */
  status: status.nullable(),
  priority: priority.nullable(),
  description: z.string().nullable(),
  /** O lugar que o usuario disse, como ele disse: o servidor procura no mapa o endereco de um lugar que existe. */
  location: z.string().nullable().default(null),
  tags,
  ...cadence,
});

const seriesEdit = z.object({
  id: z.string().min(1),
  name: z.string().min(1).nullable(),
  description: z.string().nullable(),
  /** O lugar novo, como o usuario disse (o servidor procura o endereco no mapa); `""` tira o local da serie. */
  location: z.string().nullable().default(null),
  priority: priority.nullable(),
  tags: z.array(z.string()).nullable(),
  ...cadenceChanges,
});

/**
 * O que o agente de escrita devolve: tudo o que o pedido cria e tudo o que ele altera, de uma vez. Toda lista
 * existe, vazia quando nao ha nada daquele tipo. `query` e a consulta de leitura que ele pede quando precisa
 * alterar algo que nao esta entre os candidatos.
 */
export const entityOutput = z.object({
  tasks: z.array(newTask).default([]),
  artifacts: z.array(newArtifact).default([]),
  series: z.array(newSeries).default([]),
  taskEdits: z.array(taskEdit).default([]),
  artifactEdits: z.array(artifactEdit).default([]),
  seriesEdits: z.array(seriesEdit).default([]),
  query: lookup.default(null),
});

/** Uma frase curta sobre o que falhou, so quando algum passo falhou. */
export const failureExplanationOutput = z.object({ message: z.string().min(1) });

export type EntityOutput = z.infer<typeof entityOutput>;
export type NewTask = z.infer<typeof newTask>;
export type NewArtifact = z.infer<typeof newArtifact>;
export type NewSeries = z.infer<typeof newSeries>;
export type TaskEdit = z.infer<typeof taskEdit>;
export type ArtifactEdit = z.infer<typeof artifactEdit>;
export type SeriesEdit = z.infer<typeof seriesEdit>;
export type FoodEditOutput = z.infer<typeof foodEditOutput>;
export type SleepEditOutput = z.infer<typeof sleepEditOutput>;
export type TrainingEditOutput = z.infer<typeof trainingEditOutput>;
export type AgentFileEditOutput = z.infer<typeof agentFileEditOutput>;
export type TaskEditOutput = z.infer<typeof taskEditOutput>;
export type ArtifactEditOutput = z.infer<typeof artifactEditOutput>;
