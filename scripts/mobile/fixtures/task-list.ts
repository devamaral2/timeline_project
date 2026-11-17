/**
 * Fixtures da lista de Tarefas: as respostas de `GET /api/tasks/tracked` validadas pelo schema do contrato e as
 * saídas das funções do web que a tela usa (`oneRowPerSeries`, `groupTrackedTasks`, `showsSeriesRule`,
 * `recurrenceRuleLabel`, `cardWhenLabel` com a regra no lugar do horário, `taskFilterCount`, `trackedFilters`,
 * `tagsByUse`). A hierarquia (`nestSubtasks`) é da gaveta de subtarefas, ticket 08.
 */
import { taskCardSchema } from "../../../packages/contracts/src/schemas";
import { statusPatch } from "../../../apps/web/src/lib/tasks/task-read-model";
import { cardWhenLabel, recurrenceRuleLabel } from "../../../apps/web/src/lib/tasks/card-text";
import { groupTrackedTasks, oneRowPerSeries, showsSeriesRule } from "../../../apps/web/src/lib/tasks/task-groups";
import { PRIORITY_ORDER, tagsByUse, taskFilterCount, trackedFilters } from "../../../apps/web/src/lib/tasks/task-filters";
import { NOW } from "./tasks";

type CardInput = Record<string, unknown> & { id: string; name: string };

function card(input: CardInput) {
  return taskCardSchema.parse({
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
    ...input,
  });
}

function rule(overrides: Record<string, unknown> = {}) {
  return { frequency: "daily", interval: 1, timeOfDay: "18:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01", ...overrides };
}

function occurrence(seriesId: string, occurrenceOn: string, ruleOverrides: Record<string, unknown> = {}, detached = false) {
  return { id: seriesId, occurrenceOn, detached, rule: rule(ruleOverrides) };
}

const WEEKLY = { frequency: "weekly", timeOfDay: "18:30", byWeekday: 2 + 8 + 32 };

/** A lista que o servidor devolve sem filtro, na ordem dele: uma tarefa de cada grupo, três séries e uma ocorrência destacada. */
const cards = [
  card({ id: "task-1", name: "Reunião de planejamento", status: "todo", priority: "high", startedAt: "2026-09-14T12:00:00.000Z", estimatedFinishAt: "2026-09-14T12:50:00.000Z", tags: ["trabalho", "saúde"], revision: 3 }),
  card({ id: "task-2", name: "Revisar contrato", status: "doing", priority: "urgent", startedAt: "2026-09-14T13:00:00.000Z", tags: ["trabalho"] }),
  card({ id: "task-3", name: "Buscar passagens", actor: "agent", kind: "search_request", status: "running", startedAt: "2026-09-14T14:48:00.000Z" }),
  card({ id: "task-4", name: "Montar relatório", actor: "agent", kind: "build_request", status: "queued", startedAt: "2026-09-14T14:57:00.000Z" }),
  card({ id: "task-5", name: "Qual hotel prefere?", actor: "agent", kind: "inquiry_request", status: "waiting", startedAt: "2026-09-14T13:00:00.000Z" }),
  card({ id: "task-6", name: "Ideia sem data", status: "toDefine", priority: "low", tags: ["casa"] }),
  card({ id: "task-7", name: "Esperando retorno do banco", status: "inHold", startedAt: "2026-09-16T12:00:00.000Z", tags: ["casa"] }),
  card({ id: "task-8", name: "Almoço", kind: "meal", status: "done", startedAt: "2026-09-14T15:00:00.000Z", estimatedFinishAt: "2026-09-14T16:30:00.000Z", tags: ["áurea"] }),
  card({ id: "task-9", name: "Resumo pronto", actor: "agent", kind: "review_request", status: "done", startedAt: "2026-09-12T15:00:00.000Z" }),
  card({ id: "task-10", name: "Backup falhou", actor: "agent", kind: "cron", status: "failed", startedAt: "2026-09-14T02:00:00.000Z" }),
  card({ id: "task-11", name: "Pedido cancelado", actor: "agent", kind: "request", status: "cancel", startedAt: "2026-09-14T10:00:00.000Z" }),
  card({ id: "task-12", name: "Consulta perdida", status: "missed", startedAt: "2026-09-10T12:00:00.000Z" }),
  card({ id: "task-13", name: "Projeto longo", status: "doing", longRunning: true, startedAt: "2026-09-01T12:00:00.000Z", estimatedFinishAt: "2026-11-30T12:00:00.000Z", tags: ["trabalho"] }),
  // Série diária "Meditar": fica a aberta de menor `occurrenceOn`, na posição dela.
  card({ id: "series-a-1", name: "Meditar", status: "done", startedAt: "2026-09-13T21:00:00.000Z", recurrence: occurrence("series-a", "2026-09-13") }),
  card({ id: "series-a-2", name: "Meditar", status: "todo", startedAt: "2026-09-14T21:00:00.000Z", recurrence: occurrence("series-a", "2026-09-14") }),
  card({ id: "series-a-3", name: "Meditar", status: "todo", startedAt: "2026-09-15T21:00:00.000Z", recurrence: occurrence("series-a", "2026-09-15") }),
  // A ocorrência destacada já não segue a série: passa sem mudança e mostra o horário.
  card({ id: "series-a-4", name: "Meditar (manhã)", status: "todo", startedAt: "2026-09-16T10:00:00.000Z", recurrence: occurrence("series-a", "2026-09-16", {}, true) }),
  // Série semanal sem ocorrência aberta: fica a de menor `occurrenceOn`, que vem depois na lista.
  card({ id: "series-b-1", name: "Academia", kind: "training", status: "done", startedAt: "2026-09-12T21:30:00.000Z", recurrence: occurrence("series-b", "2026-09-12", WEEKLY) }),
  card({ id: "series-b-2", name: "Academia", kind: "training", status: "done", startedAt: "2026-09-10T21:30:00.000Z", recurrence: occurrence("series-b", "2026-09-10", WEEKLY) }),
  // Uma série encerrada na fila de cancelamento também vira uma linha só.
  card({ id: "series-c-1", name: "Pagar a luz", status: "cancel", startedAt: "2026-09-05T12:00:00.000Z", recurrence: occurrence("series-c", "2026-09-05", { frequency: "monthly", byMonthDay: 5, timeOfDay: "09:00" }) }),
  card({ id: "series-c-2", name: "Pagar a luz", status: "inHold", startedAt: "2026-10-05T12:00:00.000Z", recurrence: occurrence("series-c", "2026-10-05", { frequency: "monthly", byMonthDay: 5, timeOfDay: "09:00" }) }),
];

const pick = (...ids: string[]) => cards.filter((item) => ids.includes(item.id));

/** A lista depois que o servidor trocou o status de uma tarefa: a releitura que o sucesso e o conflito trazem. */
function reread(changes: Record<string, Record<string, unknown>>) {
  return cards.map((item) => (changes[item.id] ? card({ ...item, ...changes[item.id] }) : item));
}

const rules = [
  { frequency: "daily", interval: 1, timeOfDay: "18:00" },
  { frequency: "daily", interval: 3, timeOfDay: "07:15" },
  { frequency: "weekly", interval: 1, timeOfDay: "18:30", byWeekday: 2 + 8 + 32 },
  { frequency: "weekly", interval: 1, timeOfDay: "08:00", byWeekday: 1 },
  { frequency: "weekly", interval: 2, timeOfDay: "08:00", byWeekday: 2 + 64 },
  { frequency: "weekly", interval: 1, timeOfDay: "08:00", byWeekday: 127 },
  { frequency: "monthly", interval: 1, timeOfDay: "09:00", byMonthDay: 5 },
  { frequency: "monthly", interval: 2, timeOfDay: "09:00", byMonthDay: 15 },
  { frequency: "yearly", interval: 1, timeOfDay: "10:00", byMonthDay: 14, byMonth: 9 },
].map((item) => ({ ...rule(), ...item }));

const filterCases = [
  { tag: null, priorities: [], query: "" },
  { tag: "trabalho", priorities: [], query: "" },
  { tag: null, priorities: ["low", "urgent"], query: "" },
  { tag: null, priorities: ["medium", "high", "urgent", "low"], query: "contrato" },
  { tag: "casa", priorities: ["high"], query: "banco" },
  { tag: null, priorities: [], query: "reunião" },
].map((filters) => ({ filters, count: taskFilterCount(filters), query: trackedFilters(filters) }));

export function taskListFixtures(): Record<string, unknown> {
  const rows = oneRowPerSeries(cards);
  return {
    "task-list-all": cards,
    "task-list-trabalho": cards.filter((item) => item.tags.includes("trabalho")),
    "task-list-contrato": pick("task-2"),
    "task-list-empty": [],
    "task-list-human": cards.filter((item) => item.actor === "human"),
    "task-list-agents": cards.filter((item) => item.actor === "agent"),
    /** A lista depois que os três pedidos abertos do agente terminaram. */
    "task-list-agents-finished": reread({
      "task-3": { status: "done" },
      "task-4": { status: "done" },
      "task-5": { status: "done" },
    }),
    /** Depois de "Reunião de planejamento" passar a "doing" (revisão 4) e a "done" (revisão 4), pelo próprio servidor. */
    "task-list-after-doing": reread({ "task-1": { status: "doing", revision: 4 } }),
    "task-list-after-done": reread({ "task-1": { status: "done", revision: 4 } }),
    /** A releitura de um conflito: outra pessoa já tinha cancelado a tarefa (revisão 9). */
    "task-list-after-conflict": reread({ "task-1": { status: "cancel", revision: 9 } }),
    "task-list-pipeline": {
      now: NOW,
      cards,
      rowIds: rows.map((item) => item.id),
      groups: groupTrackedTasks(rows).map((group) => ({
        key: group.key,
        title: group.title,
        collapsedByDefault: group.collapsedByDefault,
        ids: group.cards.map((item) => item.id),
      })),
      whens: cards.map((item) => ({
        id: item.id,
        showsRule: showsSeriesRule(item),
        when: cardWhenLabel(item, new Date(NOW), { ruleInPlaceOfTime: showsSeriesRule(item) }),
      })),
      rules: rules.map((item) => ({ rule: item, label: recurrenceRuleLabel(item as never) })),
      filterCases,
      priorityOrder: PRIORITY_ORDER,
      tagsByUse: tagsByUse(cards),
      /** O corpo do `PATCH` que a lista manda ao reabrir a "Almoço" (`done`), e o de concluir, pelo `statusPatch` do web. */
      patches: {
        now: "2026-09-14T15:30:45.123Z",
        doing: statusPatch({ revision: 3, status: "todo" }, "doing", new Date("2026-09-14T15:30:45.123Z")),
        reopen: statusPatch({ revision: 1, status: "done" }, "todo", new Date("2026-09-14T15:30:45.123Z")),
      },
    },
  };
}
