/**
 * Fixture das quatro gavetas da lista de Tarefas (ticket 65): os casos da regra `drawerOf` do web (um por status de
 * pessoa, com e sem tarefa longa; um por status de agente, com cada situação e sem nenhuma; a execução agendada com
 * qualquer status) e o que a tela faz com eles (`listedCards`, `nestSubtasks`, `drawersOf`, `toNowLabel`). O Android
 * porta a regra e confere contra este arquivo (`TaskDrawersTest`).
 */
import { agentTaskStatusSchema, taskCardSchema } from "../../../packages/contracts/src/schemas";
import { nestSubtasks, oneRowPerSeries } from "../../../apps/web/src/lib/tasks/task-groups";
import { drawerOf, drawersOf, listedCards, toNowLabel } from "../../../apps/web/src/lib/tasks/task-drawers";
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

const HUMAN_STATUSES = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const;
const SITUATIONS = ["to_review", "bookmarked", "reviewed"] as const;
const FINAL_AGENT = ["completed", "interrupted", "failed", "cancelled", "rolled_back"] as const;

/** Um cartão por caso da tabela da regra, com o id dizendo qual é. */
const ruleCards = [
  ...HUMAN_STATUSES.flatMap((status) => [
    card({ id: `human-${status}`, name: `Pessoa ${status}`, status }),
    card({ id: `human-${status}-long`, name: `Pessoa ${status}, longa`, status, longRunning: true }),
  ]),
  ...agentTaskStatusSchema.options
    .filter((status) => !(FINAL_AGENT as readonly string[]).includes(status))
    .map((status) => card({ id: `agent-${status}`, name: `Agente ${status}`, actor: "agent", kind: "request", status })),
  ...FINAL_AGENT.flatMap((status) => [
    card({ id: `agent-${status}`, name: `Agente ${status}`, actor: "agent", kind: "request", status }),
    ...SITUATIONS.map((situation) => card({ id: `agent-${status}-${situation}`, name: `Agente ${status}, ${situation}`, actor: "agent", kind: "request", status, situation })),
  ]),
  ...agentTaskStatusSchema.options.map((status) => card({ id: `cron-${status}`, name: `Agendada ${status}`, actor: "agent", kind: "cron", status })),
  card({ id: "reference", name: "Referência sem status" }),
];

/**
 * Uma lista na ordem do servidor, misturando agente antes de pessoa de propósito: pessoa vem antes de agente em cada
 * gaveta. Traz um pedido em andamento com a subtarefa de pessoa (continua linha), uma principal de pessoa com subtarefa
 * em outra gaveta (fica dentro dela), uma série (uma linha só) e o trabalho em andamento que sai da lista.
 */
const listCards = [
  card({ id: "ag-review", name: "Resumo para revisar", actor: "agent", kind: "request", status: "completed", situation: "to_review" }),
  card({ id: "pe-todo", name: "Reunião", status: "todo", startedAt: "2026-09-14T12:00:00.000Z" }),
  card({ id: "ag-waiting", name: "Qual hotel?", actor: "agent", kind: "inquiry_request", status: "waiting" }),
  card({ id: "ag-cron", name: "Backup da noite", actor: "agent", kind: "cron", status: "failed" }),
  card({ id: "pe-long", name: "Projeto longo", status: "doing", longRunning: true }),
  card({ id: "ag-run", name: "Buscar passagens", actor: "agent", kind: "search_request", status: "running", startedAt: "2026-09-14T14:48:00.000Z" }),
  card({ id: "pe-child-of-run", name: "Conferir datas", status: "todo", parentTaskId: "ag-run" }),
  card({ id: "ag-queued", name: "Montar relatório", actor: "agent", kind: "build_request", status: "queued" }),
  card({ id: "pe-hold", name: "Esperando o banco", status: "inHold" }),
  card({ id: "ag-bookmark", name: "Resumo guardado", actor: "agent", kind: "request", status: "completed", situation: "bookmarked" }),
  card({ id: "pe-trip", name: "Planejar viagem", status: "doing" }),
  card({ id: "pe-trip-done", name: "Reservar hotel", status: "done", parentTaskId: "pe-trip" }),
  card({ id: "pe-done", name: "Almoço", kind: "meal", status: "done" }),
  card({ id: "ag-reviewed", name: "Resumo revisado", actor: "agent", kind: "request", status: "completed", situation: "reviewed" }),
  card({ id: "ag-failed", name: "Pedido que falhou", actor: "agent", kind: "request", status: "failed" }),
  card({ id: "pe-cancel", name: "Trocar o plano", status: "cancel" }),
];

function pipelineOf(input: ReturnType<typeof card>[]) {
  const rows = listedCards(oneRowPerSeries(input));
  const tree = nestSubtasks(rows);
  const drawers = drawersOf(tree.roots);
  const toNow = drawers.find((drawer) => drawer.key === "now")?.cards.length ?? 0;
  return {
    rowIds: rows.map((item) => item.id),
    roots: tree.roots.map((item) => item.id),
    subtasks: Object.fromEntries(rows.map((item) => [item.id, tree.subtasksOf(item.id).map((child) => child.id)])),
    drawers: drawers.map((drawer) => ({
      key: drawer.key,
      title: drawer.title,
      collapsedByDefault: drawer.collapsedByDefault,
      ids: drawer.cards.map((item) => item.id),
    })),
    toNow,
    summary: toNowLabel(toNow),
  };
}

export function taskDrawersFixtures(): Record<string, unknown> {
  return {
    "task-list-drawers": {
      now: NOW,
      /** A regra, caso a caso: o id do cartão e a gaveta (`null` quando não há, `execution` quando fica fora da lista). */
      rule: { cards: ruleCards, drawers: ruleCards.map((item) => ({ id: item.id, drawer: drawerOf(item) })) },
      /** A tela: do que o servidor devolve às gavetas, com a contagem do resumo. */
      pipeline: { cards: listCards, ...pipelineOf(listCards) },
      /** Sem nada para agora: o resumo diz que não há tarefa. */
      empty: { cards: [listCards[3]], ...pipelineOf([listCards[3]]) },
      /** Uma tarefa de agente muda de situação e troca de gaveta (a lista na hora, sem reler). */
      situationChanges: SITUATIONS.map((situation) => {
        const changed = listCards.map((item) => (item.id === "ag-review" ? card({ ...item, situation }) : item));
        return { situation, ...pipelineOf(changed) };
      }),
    },
  };
}
