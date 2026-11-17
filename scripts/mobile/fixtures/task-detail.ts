/**
 * Fixtures do detalhe da tarefa de pessoa: as respostas de `GET /api/tasks/{id}` validadas pelo `taskSchema` do
 * contrato e as saídas das funções do web que o detalhe usa (`momentLabel`, `recurrenceLines`, `reminderLabel`,
 * `mapsUrl`, `priorityPatch`, `cardDurationLabel`), mais as linhas que a seção Informações monta delas.
 */
import { taskSchema } from "../../../packages/contracts/src/schemas";
import { cardDurationLabel, recurrenceRuleLabel } from "../../../apps/web/src/lib/tasks/card-text";
import { mapsUrl } from "../../../apps/web/src/lib/tasks/maps-link";
import { momentLabel, priorityPatch, recurrenceLines, reminderLabel } from "../../../apps/web/src/lib/tasks/task-read-model";

type TaskInput = Record<string, unknown> & { id: string; name: string };

function task(input: TaskInput) {
  return taskSchema.parse({
    actor: "human",
    kind: "common",
    priority: "medium",
    description: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    artifacts: [],
    subtaskIds: [],
    requests: [],
    ...input,
  });
}

const weeklyRule = {
  frequency: "weekly",
  interval: 1,
  byWeekday: 0b0101010,
  timeOfDay: "18:30",
  durationMinutes: 50,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
  endsOn: "2026-11-30",
};

/** Tudo que o detalhe lê: início com hora, fim, local, lembretes, tags, descrição, série, tarefa principal, subtarefas e pedidos. */
const full = task({
  id: "task-1",
  name: "Reunião de planejamento",
  status: "todo",
  priority: "high",
  description: "Pauta do trimestre.\nLevar o relatório impresso.",
  location: "Rua Augusta, 100 - São Paulo",
  startedAt: "2026-09-14T21:30:00.000Z",
  estimatedFinishAt: "2026-09-14T22:20:00.000Z",
  notifyOffsetsMinutes: [30, 1440, 2880],
  tags: ["trabalho", "saúde"],
  parentTaskId: "task-parent",
  subtaskIds: ["task-sub-1", "task-sub-2"],
  recurrence: { id: "rec-1", occurrenceOn: "2026-09-14", detached: false, rule: weeklyRule },
  revision: 4,
  requests: [
    { id: "req-1", name: "Marque a reunião de planejamento", relation: "generates", at: "2026-09-01T12:00:00.000Z" },
    { id: "req-2", name: "Mude para as 18h30", relation: "updates", at: "2026-09-10T15:00:00.000Z" },
    { id: "req-3", name: "Adicione o local", relation: "updates", at: "2026-09-12T15:05:00.000Z" },
  ],
});

/** A tarefa de referência: "só agenda", sem status, e com a prioridade que o contrato exige. */
const reference = task({ id: "task-9", name: "Pagar o condomínio", startedAt: "2026-09-14T03:00:00.000Z", revision: 4 });

/** Tarefa longa em curso, com início e prazo. */
const long = task({
  id: "task-7",
  name: "Projeto longo",
  status: "doing",
  longRunning: true,
  startedAt: "2026-09-01T12:00:00.000Z",
  estimatedFinishAt: "2026-11-30T12:00:00.000Z",
  tags: ["trabalho"],
  revision: 2,
});

/** Tarefa longa sem data nenhuma e dia sem hora: os textos de reserva. */
const longUndated = task({ id: "task-14", name: "Ideia grande", status: "toDefine", longRunning: true, revision: 2 });
const dayOnly = task({
  id: "task-15",
  name: "Entregar o documento",
  status: "todo",
  startedAt: "2026-09-14T03:00:00.000Z",
  estimatedFinishAt: "2026-09-14T03:00:00.000Z",
});
const minimal = task({ id: "task-2", name: "Ligar para o banco", status: "todo", startedAt: "2026-09-14T15:00:00.000Z" });
const noDate = task({ id: "task-3", name: "Sem data", status: "toDefine" });
const detachedYearly = task({
  id: "task-16",
  name: "Aniversário",
  status: "todo",
  startedAt: "2026-09-14T15:00:00.000Z",
  recurrence: {
    id: "rec-2",
    occurrenceOn: "2026-09-14",
    detached: true,
    rule: { frequency: "yearly", interval: 1, byMonthDay: 14, byMonth: 9, timeOfDay: "09:00", timeZone: "America/Sao_Paulo", startsOn: "2020-09-14" },
  },
});

const agent = task({
  id: "task-agent",
  name: "Buscar passagens",
  actor: "agent",
  kind: "search_request",
  status: "running",
  startedAt: "2026-09-14T14:48:00.000Z",
});

const parent = task({ id: "task-parent", name: "Planejar o trimestre", status: "doing", startedAt: "2026-09-13T15:00:00.000Z", subtaskIds: ["task-1"] });
const subOne = task({ id: "task-sub-1", name: "Preparar a pauta", kind: "meal", status: "done", startedAt: "2026-09-14T15:00:00.000Z", parentTaskId: "task-1" });
const subTwo = task({
  id: "task-sub-2",
  name: "Reservar a sala",
  actor: "agent",
  kind: "build_request",
  status: "queued",
  startedAt: "2026-09-14T14:57:00.000Z",
  parentTaskId: "task-1",
});

/** O que a seção Informações mostra, linha a linha, pelas regras de `TaskInfoSection.tsx`. */
function infoOf(item: ReturnType<typeof task>) {
  const duration = cardDurationLabel(item);
  return {
    start: item.startedAt || !item.longRunning ? (item.startedAt ? momentLabel(item.startedAt) : "sem data") : null,
    endLabel: item.longRunning ? "Previsão de entrega" : "Término",
    end: item.estimatedFinishAt ? momentLabel(item.estimatedFinishAt) : "sem data",
    duration,
    persistent: item.longRunning,
    recurrence: item.recurrence ? recurrenceLines(item.recurrence) : null,
    location: item.location ?? null,
    reminders: item.notifyOffsetsMinutes.map(reminderLabel),
    tags: item.tags,
    description: item.description || null,
  };
}

const infoTasks = [full, reference, long, longUndated, dayOnly, minimal, noDate, detachedYearly];

const rules = [
  weeklyRule,
  { frequency: "daily", interval: 1, timeOfDay: "07:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" },
  { frequency: "daily", interval: 3, timeOfDay: "07:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" },
  { frequency: "weekly", interval: 1, byWeekday: 0b0000001, timeOfDay: "08:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" },
  { frequency: "weekly", interval: 2, byWeekday: 0b1111110, timeOfDay: "08:15", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" },
  { frequency: "weekly", interval: 1, byWeekday: 0b1000000, timeOfDay: "08:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01", endsOn: "2026-12-31" },
  { frequency: "monthly", interval: 1, byMonthDay: 5, timeOfDay: "10:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" },
  { frequency: "monthly", interval: 2, byMonthDay: 15, timeOfDay: "10:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" },
  { frequency: "yearly", interval: 1, byMonthDay: 14, byMonth: 9, timeOfDay: "09:00", timeZone: "America/Sao_Paulo", startsOn: "2020-09-14" },
];

const instants = [
  "2026-09-14T21:30:00.000Z",
  "2026-09-14T03:00:00.000Z",
  "2026-09-12T15:05:00.000Z",
  "2026-11-30T12:00:00.000Z",
  "2026-09-15T02:59:00.000Z",
  "2026-12-31T23:59:00.000Z",
  "2026-09-13T15:00:00.000Z",
];

const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export function taskDetailFixtures(): Record<string, unknown> {
  return {
    "task-detail-person": full,
    "task-detail-reference": reference,
    "task-detail-long": long,
    "task-detail-minimal": minimal,
    "task-detail-agent": agent,
    "task-detail-parent": parent,
    "task-detail-sub-1": subOne,
    "task-detail-sub-2": subTwo,
    /** A tarefa depois que outro lugar mudou o status ou a prioridade: a releitura que o sucesso e o conflito trazem. */
    "task-detail-reloaded-doing": { ...full, status: "doing", revision: 5 },
    "task-detail-reloaded-done": { ...full, status: "done", revision: 5, finishedAt: "2026-09-14T15:30:45.123Z" },
    "task-detail-reloaded-urgent": { ...full, priority: "urgent", revision: 5 },
    "task-detail-done": { ...full, status: "done", revision: 6, finishedAt: "2026-09-14T15:30:45.123Z" },
    "task-detail-text": {
      moments: instants.map((instant) => ({ instant, label: momentLabel(instant) })),
      recurrences: rules.map((rule) => ({
        rule,
        label: recurrenceRuleLabel(rule as never),
        lines: recurrenceLines({ id: "r", occurrenceOn: "2026-09-14", detached: false, rule } as never),
        detachedLines: recurrenceLines({ id: "r", occurrenceOn: "2026-09-14", detached: true, rule } as never),
      })),
      reminders: [1, 5, 30, 45, 60, 90, 1440, 2880, 10080].map((minutes) => ({ minutes, label: reminderLabel(minutes) })),
      maps: ["Rua Augusta, 100 - São Paulo", "  Av. Paulista 1578  ", "Café & Cia (Pinheiros)", "Praça da Sé #1/2", "O'Brien's! *~ pub_1-2.x"].map((location) => ({ location, url: mapsUrl(location) })),
      priorityPatches: PRIORITIES.map((priority) => ({ priority, patch: priorityPatch({ revision: 4 }, priority) })),
      info: infoTasks.map((item) => ({ id: item.id, task: item, info: infoOf(item) })),
    },
  };
}
