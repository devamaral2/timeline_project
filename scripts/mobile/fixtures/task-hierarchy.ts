/**
 * Fixtures da hierarquia na edição (ticket 15): as tarefas e os cartões validados pelo contrato, os pedidos ao Hermes
 * que criam tarefas e as saídas de `buildTaskPatch` do web para as trocas de tarefa principal e de subtarefas.
 */
import {
  createTaskInputSchema,
  requestSchema,
  taskCardSchema,
  taskSchema,
  updateTaskInputSchema,
} from "../../../packages/contracts/src/schemas";
import { buildTaskPatch, draftFromTask, type TaskDraft } from "../../../apps/web/src/components/task-detail/task-draft";
import { PERSONAL_PROJECT } from "./project";

type TaskInput = Record<string, unknown> & { id: string; name: string };

function task(input: TaskInput) {
  return taskSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
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
    startedAt: "2026-09-20T12:00:00.000Z",
    artifacts: [],
    subtaskIds: [],
    requests: [],
    ...input,
  });
}

/** O cartão que as listas servem: a tarefa sem o que só o detalhe tem. */
function card(source: ReturnType<typeof task>) {
  const { artifacts: _artifacts, subtaskIds: _subtaskIds, requests: _requests, ...rest } = source;
  return taskCardSchema.parse(rest);
}

const NOW = "2026-09-14T15:30:45.123Z";

const open = task({ id: "task-open", name: "Planejar a viagem", revision: 3, parentTaskId: "task-parent", subtaskIds: ["task-sub-1", "task-sub-2"] });
const lone = task({ id: "task-lone", name: "Tarefa solta", revision: 2 });
const parent = task({ id: "task-parent", name: "Viagem de setembro", status: "doing", subtaskIds: ["task-open"] });
const otherParent = task({ id: "task-parent-2", name: "Projeto do trimestre", status: "toDefine", startedAt: undefined });
const sub1 = task({ id: "task-sub-1", name: "Comprar passagens", parentTaskId: "task-open" });
const sub2 = task({ id: "task-sub-2", name: "Reservar hotel", status: "done", finishedAt: "2026-09-13T20:00:00.000Z", parentTaskId: "task-open" });
const agentTask = task({ id: "task-agent", actor: "agent", kind: "search_request", status: "running", name: "Buscar voos", startedAt: "2026-09-14T14:48:00.000Z" });
const created = task({ id: "task-created", name: "Alugar um carro" });
const hermesTop = task({ id: "task-h1", name: "Preparar a mala" });
const hermesChild = task({ id: "task-h2", name: "Separar os casacos", parentTaskId: "task-h1" });
const hermesSecond = task({ id: "task-h3", name: "Carregar os aparelhos" });

const tasks = { open, lone, parent, otherParent, sub1, sub2, agentTask, created, hermesTop, hermesChild, hermesSecond };

/** O que `GET /api/tasks/tracked?limit=50` devolve: tarefas de pessoa e de agente, as que têm status. */
const tracked = [open, parent, otherParent, sub1, sub2, agentTask, lone].map(card);
const trackedFiltered = [card(otherParent)];

function edit(base: ReturnType<typeof task>, changes: Partial<TaskDraft>): TaskDraft {
  return { ...draftFromTask(base), ...changes };
}

const patchCases = [
  { name: "unchanged", task: open, draft: edit(open, {}) },
  { name: "parent removed", task: open, draft: edit(open, { parentTaskId: null }) },
  { name: "parent replaced", task: open, draft: edit(open, { parentTaskId: "task-parent-2" }) },
  { name: "parent set", task: lone, draft: edit(lone, { parentTaskId: "task-parent" }) },
  { name: "subtask added", task: open, draft: edit(open, { subtaskIds: ["task-sub-1", "task-sub-2", "task-created"] }) },
  { name: "subtask removed", task: open, draft: edit(open, { subtaskIds: ["task-sub-2"] }) },
  { name: "subtasks cleared", task: open, draft: edit(open, { subtaskIds: [] }) },
  { name: "subtasks reordered", task: open, draft: edit(open, { subtaskIds: ["task-sub-2", "task-sub-1"] }) },
  { name: "both and the name", task: open, draft: edit(open, { name: "Viagem de outubro", parentTaskId: null, subtaskIds: ["task-created"] }) },
].map((item) => {
  const patch = buildTaskPatch(item.task, item.draft, new Date(NOW));
  if (patch) updateTaskInputSchema.parse({ taskId: item.task.id, ...patch });
  return { name: item.name, task: item.task, draft: item.draft, now: NOW, patch };
});

function request(input: Record<string, unknown> & { id: string }) {
  return requestSchema.parse({
    kind: "request",
    route: "steps",
    status: "running",
    title: "Preparar a viagem",
    project: PERSONAL_PROJECT,
    text: "Preparar a mala",
    createdAt: "2026-09-14T15:30:00.000Z",
    updatedAt: "2026-09-14T15:30:05.000Z",
    steps: [],
    entities: [],
    ...input,
  });
}

const createdEntities = [
  { kind: "task", id: "task-h1", name: "Preparar a mala", operation: "create", linkedTo: [] },
  { kind: "task", id: "task-h2", name: "Separar os casacos", operation: "create", linkedTo: [{ kind: "task", id: "task-h1" }] },
  { kind: "task", id: "task-h3", name: "Carregar os aparelhos", operation: "create", linkedTo: [] },
  { kind: "task", id: "task-open", name: "Planejar a viagem", operation: "update", linkedTo: [] },
  { kind: "artifact", id: "art-1", name: "Lista da mala", artifactType: "text", operation: "create", linkedTo: [] },
];

const requests = {
  accepted: { requestId: "req-hermes" },
  queued: request({ id: "req-hermes", status: "queued" }),
  running: request({ id: "req-hermes", status: "running", progress: "Criando as tarefas…" }),
  runningStep: request({ id: "req-hermes", status: "running", steps: [{ id: "s1", agent: "writer", label: "Montar as tarefas", status: "running" }] }),
  done: request({ id: "req-hermes", status: "completed", entities: createdEntities }),
  doneNothing: request({ id: "req-hermes", status: "completed", entities: createdEntities.slice(3), message: "Não encontrei o que criar." }),
  doneNothingBare: request({ id: "req-hermes", status: "completed", entities: [] }),
  failed: request({ id: "req-hermes", status: "failed", errorCode: "unavailable", message: "O Hermes está fora do ar." }),
  failedBare: request({ id: "req-hermes", status: "failed", errorCode: "internal" }),
};

/** O corpo que a lista do web manda ao criar pelo nome: o `createTask` do `TaskCreateActions`. */
const createBody = createTaskInputSchema.parse({ kind: "common", name: "Alugar um carro", description: "", priority: "medium", status: "todo" });

export function taskHierarchyFixtures(): Record<string, unknown> {
  return {
    "task-hierarchy-tasks": tasks,
    "task-hierarchy-tracked": tracked,
    "task-hierarchy-tracked-filtered": trackedFiltered,
    "task-hierarchy-patch-cases": patchCases,
    "task-hierarchy-create-body": createBody,
    "task-hierarchy-created": { taskId: "task-created" },
    "task-hierarchy-request-accepted": requests.accepted,
    "task-hierarchy-request-queued": requests.queued,
    "task-hierarchy-request-running": requests.running,
    "task-hierarchy-request-running-step": requests.runningStep,
    "task-hierarchy-request-done": requests.done,
    "task-hierarchy-request-done-nothing": requests.doneNothing,
    "task-hierarchy-request-done-nothing-bare": requests.doneNothingBare,
    "task-hierarchy-request-failed": requests.failed,
    "task-hierarchy-request-failed-bare": requests.failedBare,
  };
}
