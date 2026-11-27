/**
 * Fixtures da lista de Tarefas: as respostas de `GET /api/tasks/tracked` validadas pelo schema do contrato e as
 * saídas das funções do web que a tela usa (`oneRowPerSeries`, `groupTrackedTasks`, `showsSeriesRule`,
 * `recurrenceRuleLabel`, `cardWhenLabel` com a regra no lugar do horário, `taskFilterCount`, `trackedFilters`,
 * `tagsByUse`) e a gaveta de subtarefas (`nestSubtasks`, ticket 08).
 */
import { taskCardSchema } from "../../../packages/contracts/src/schemas";
import { statusPatch } from "../../../apps/web/src/lib/tasks/task-read-model";
import { cardIsOverdue, cardWhenLabel, recurrenceRuleLabel } from "../../../apps/web/src/lib/tasks/card-text";
import { groupTrackedTasks, nestSubtasks, oneRowPerSeries, showsSeriesRule } from "../../../apps/web/src/lib/tasks/task-groups";
import { PRIORITY_ORDER, tagsByUse, taskFilterCount, trackedFilters } from "../../../apps/web/src/lib/tasks/task-filters";
import { TASK_SITUATIONS, situationNames } from "../../../apps/web/src/components/tasks/task-situation";
import { NOW } from "./tasks";
import { PERSONAL_PROJECT } from "./project";

type CardInput = Record<string, unknown> & { id: string; name: string };

function card(input: CardInput) {
  return taskCardSchema.parse({
    actor: "human",
    kind: "common",
    priority: "medium",
    description: "",
    project: PERSONAL_PROJECT,
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
  card({ id: "task-9", name: "Resumo pronto", actor: "agent", kind: "review_request", status: "completed", startedAt: "2026-09-12T15:00:00.000Z" }),
  card({ id: "task-10", name: "Backup falhou", actor: "agent", kind: "cron", status: "failed", startedAt: "2026-09-14T02:00:00.000Z" }),
  card({ id: "task-11", name: "Pedido cancelado", actor: "agent", kind: "request", status: "cancelled", startedAt: "2026-09-14T10:00:00.000Z" }),
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

/**
 * A lista com situação (ticket 58): um cartão de cada situação, e os que não têm situação (esperando você, execução agendada,
 * em andamento, e o concluído de antes da situação existir). O servidor só manda a situação no pedido de agente que terminou.
 */
const situationCards = [
  card({ id: "sit-person", name: "Tarefa minha", status: "todo", startedAt: "2026-09-14T12:00:00.000Z" }),
  card({ id: "sit-review", name: "Resumo para revisar", actor: "agent", kind: "review_request", status: "completed", situation: "to_review", startedAt: "2026-09-14T11:00:00.000Z" }),
  card({ id: "sit-reviewed", name: "Resumo revisado", actor: "agent", kind: "review_request", status: "completed", situation: "reviewed", startedAt: "2026-09-14T10:00:00.000Z" }),
  card({ id: "sit-bookmarked", name: "Busca guardada", actor: "agent", kind: "search_request", status: "failed", situation: "bookmarked", startedAt: "2026-09-14T09:00:00.000Z" }),
  card({ id: "sit-waiting", name: "Qual hotel prefere?", actor: "agent", kind: "inquiry_request", status: "waiting", startedAt: "2026-09-14T13:00:00.000Z" }),
  card({ id: "sit-cron", name: "Backup da noite", actor: "agent", kind: "cron", status: "completed", startedAt: "2026-09-14T02:00:00.000Z" }),
  card({ id: "sit-running", name: "Buscar passagens", actor: "agent", kind: "search_request", status: "running", startedAt: "2026-09-14T14:48:00.000Z" }),
  card({ id: "sit-legacy", name: "Concluído de antes", actor: "agent", kind: "request", status: "completed", startedAt: "2026-09-01T10:00:00.000Z" }),
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

/**
 * Uma lista com hierarquia, na ordem do servidor (filhas antes das principais de propósito): uma principal com
 * subtarefas de pessoa e de agente, subtarefa de subtarefa em dois níveis, principal feita (grupo recolhido), subtarefa
 * cuja principal não veio, um ciclo de dois, uma cadeia que termina no ciclo e uma tarefa que é a própria principal.
 */
const subtaskCards = [
  card({ id: "sub-4", name: "Escolher quarto", status: "todo", parentTaskId: "sub-2", startedAt: "2026-09-15T12:00:00.000Z", revision: 2 }),
  card({ id: "sub-1", name: "Reservar hotel", status: "done", parentTaskId: "trip", startedAt: "2026-09-12T12:00:00.000Z" }),
  card({ id: "trip", name: "Planejar viagem", status: "doing", startedAt: "2026-09-14T12:00:00.000Z", revision: 5 }),
  card({ id: "sub-2", name: "Comprar passagens", status: "todo", parentTaskId: "trip", startedAt: "2026-09-13T12:00:00.000Z", revision: 3 }),
  card({ id: "sub-3", name: "Buscar roteiro", actor: "agent", kind: "search_request", status: "running", parentTaskId: "trip", startedAt: "2026-09-14T14:48:00.000Z" }),
  card({ id: "sub-5", name: "Pagar o quarto", status: "done", parentTaskId: "sub-4" }),
  card({ id: "sub-7", name: "Sem dia ainda", status: "toDefine", parentTaskId: "trip", revision: 7 }),
  card({ id: "sub-8", name: "Conferir seguro", status: "cancel", parentTaskId: "sub-4", startedAt: "2026-09-16T12:00:00.000Z" }),
  card({ id: "closed-parent", name: "Mudança concluída", status: "done", startedAt: "2026-09-10T12:00:00.000Z" }),
  card({ id: "sub-6", name: "Devolver a chave", status: "todo", parentTaskId: "closed-parent", startedAt: "2026-09-11T12:00:00.000Z" }),
  card({ id: "orphan", name: "Subtarefa solta", status: "todo", parentTaskId: "not-in-the-list", startedAt: "2026-09-14T18:00:00.000Z" }),
  card({ id: "cyc-a", name: "Ciclo A", status: "todo", parentTaskId: "cyc-b" }),
  card({ id: "cyc-b", name: "Ciclo B", status: "todo", parentTaskId: "cyc-a" }),
  card({ id: "cyc-tail", name: "Fim do ciclo", status: "todo", parentTaskId: "cyc-b" }),
  card({ id: "self", name: "Principal de si", status: "inHold", parentTaskId: "self" }),
];

/** Uma ordem embaralhada, sempre a mesma, para a regra não depender da ordem em que a rede entrega. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const other = state % (index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function nestingOf(input: ReturnType<typeof card>[]) {
  const tree = nestSubtasks(input);
  return {
    order: input.map((item) => item.id),
    roots: tree.roots.map((item) => item.id),
    subtasks: Object.fromEntries(input.map((item) => [item.id, tree.subtasksOf(item.id).map((child) => child.id)])),
  };
}

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
      "task-3": { status: "completed" },
      "task-4": { status: "completed" },
      "task-5": { status: "completed" },
    }),
    /** Depois de "Reunião de planejamento" passar a "doing" (revisão 4) e a "done" (revisão 4), pelo próprio servidor. */
    "task-list-after-doing": reread({ "task-1": { status: "doing", revision: 4 } }),
    "task-list-after-done": reread({ "task-1": { status: "done", revision: 4 } }),
    /** A releitura de um conflito: outra pessoa já tinha cancelado a tarefa (revisão 9). */
    "task-list-after-conflict": reread({ "task-1": { status: "cancel", revision: 9 } }),
    "task-list-situations": situationCards,
    /** As três situações na ordem do menu e o nome de cada uma (`TASK_SITUATIONS` e `situationNames` do web). */
    "task-situation-names": TASK_SITUATIONS.map((situation) => ({ situation, name: situationNames[situation] })),
    /** A resposta do `PUT /api/tasks/:taskId/situation`: o cartão com a situação nova. */
    "task-situation-reviewed": card({ ...situationCards[1], situation: "reviewed" }),
    "task-situation-bookmarked": card({ ...situationCards[1], situation: "bookmarked" }),
    "task-list-subtasks": subtaskCards,
    /** A lista depois de "Comprar passagens" (revisão 3) passar a "done" (revisão 4), pelo próprio servidor. */
    "task-list-subtasks-after-done": subtaskCards.map((item) => (item.id === "sub-2" ? card({ ...item, status: "done", revision: 4 }) : item)),
    /** A releitura de um conflito: outra pessoa já tinha cancelado "Comprar passagens" (revisão 9). */
    "task-list-subtasks-after-conflict": subtaskCards.map((item) => (item.id === "sub-2" ? card({ ...item, status: "cancel", revision: 9 }) : item)),
    /** Sem a principal (por filtro de tag ou prioridade, ou por não ter status): as subtarefas voltam a ser linhas. */
    "task-list-subtasks-no-parent": subtaskCards.filter((item) => item.id !== "trip"),
    /** O filtro de executor "Agentes": só a subtarefa de agente chega, sem a principal de pessoa. */
    "task-list-subtasks-agents": subtaskCards.filter((item) => item.actor === "agent"),
    "task-list-nesting": {
      now: NOW,
      cards: subtaskCards,
      /** A ordem do servidor e três embaralhadas: a árvore tem de sair igual em todas. */
      cases: [
        nestingOf(subtaskCards),
        nestingOf(shuffled(subtaskCards, 7)),
        nestingOf(shuffled(subtaskCards, 42)),
        nestingOf([...subtaskCards].reverse()),
        nestingOf(subtaskCards.filter((item) => item.id !== "trip")),
        nestingOf(subtaskCards.filter((item) => item.id !== "sub-2")),
      ],
      groups: groupTrackedTasks(nestSubtasks(oneRowPerSeries(subtaskCards)).roots).map((group) => ({
        key: group.key,
        ids: group.cards.map((item) => item.id),
      })),
      /** O quando e o atraso de cada cartão na gaveta (sem a regra da série). */
      drawer: subtaskCards.map((item) => ({
        id: item.id,
        when: cardWhenLabel(item, new Date(NOW)),
        overdue: cardIsOverdue(item, new Date(NOW)),
      })),
    },
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
