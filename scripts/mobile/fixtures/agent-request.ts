/**
 * Fixtures do detalhe da tarefa de agente: as respostas de `GET /api/requests/{id}` validadas pelo `requestSchema` do
 * contrato e as saídas das funções do web que o detalhe usa (`isOpenRequest`, `stepProgress`, `runningStepLabel`,
 * `entryText`, `entityOperationLabel`, `entityKindLabel`, `agentFailureText`, `KIND_NAMES`).
 */
import { readFileSync } from "node:fs";
import { requestSchema } from "../../../packages/contracts/src/schemas";
import { agentFailureText } from "../../../apps/web/src/lib/agent-chat/use-agent-chat";
import {
  entityKindLabel,
  entityOperationLabel,
  entryText,
  isOpenRequest,
  runningStepLabel,
  stepProgress,
} from "../../../apps/web/src/lib/tasks/agent-request-model";
import { taskDetailFixtures } from "./task-detail";
import { PERSONAL_PROJECT } from "./project";

type RequestInput = Record<string, unknown> & { id: string };

function request(input: RequestInput) {
  return requestSchema.parse({
    kind: "search_request",
    route: "steps",
    status: "running",
    title: "Buscar passagens",
    project: PERSONAL_PROJECT,
    createdAt: "2026-09-14T14:48:00.000Z",
    updatedAt: "2026-09-14T14:52:00.000Z",
    steps: [],
    entities: [],
    ...input,
  });
}

const steps = [
  { id: "s1", agent: "router", label: "Entender o pedido", status: "done" },
  { id: "s2", agent: "search", label: "Buscar voos", status: "running" },
  { id: "s3", agent: "writer", label: "Montar o resumo", status: "queued" },
];

const entries = [
  { id: "e1", kind: "request", label: "Pedido", summary: "Buscar passagens para sexta", status: "done", startedAt: "2026-09-14T14:48:05.000Z" },
  { id: "e2", kind: "routing", label: "Escolheu os agentes", source: "router", status: "done", startedAt: "2026-09-14T14:48:09.000Z" },
  { id: "e3", kind: "tool", label: "Executou um comando", source: "search.flights", summary: "voos GRU-SDU sexta", status: "running" },
];

const entities = [
  { kind: "task", id: "task-1", name: "Reunião de planejamento", operation: "create", linkedTo: [] },
  { kind: "artifact", id: "art-1", name: "Lista de voos", artifactType: "text", operation: "create", linkedTo: [] },
  { kind: "artifact", id: "art-2", name: "Café da manhã", artifactType: "food", operation: "update", linkedTo: [] },
  { kind: "artifact", id: "art-3", name: "Rascunho antigo", artifactType: "sleep", operation: "delete", linkedTo: [] },
  { kind: "artifact", id: "art-4", name: "Nota solta", operation: "update", linkedTo: [] },
];

const running = request({
  id: "task-agent",
  sessionId: "req-first",
  text: "Buscar passagens para sexta",
  steps,
  entities,
  progress: "Buscando voos…",
  trace: { route: "steps", status: "running", fields: [], entries },
});

const done = request({
  ...running,
  status: "done",
  updatedAt: "2026-09-14T14:58:00.000Z",
  steps: steps.map((step) => ({ ...step, status: "done" })),
  progress: undefined,
  trace: { route: "steps", status: "done", fields: [], entries: [...entries.map((entry) => ({ ...entry, status: "done" })), { id: "e4", kind: "answer", label: "Resposta", summary: "Achei três voos.", status: "done", startedAt: "2026-09-14T14:57:50.000Z" }] },
});

const first = request({ id: "req-first", status: "done", title: "Planejar a viagem", createdAt: "2026-09-13T12:00:00.000Z", updatedAt: "2026-09-13T12:05:00.000Z" });
const follow = request({ id: "req-new", sessionId: "req-first", title: "Só voos diretos", createdAt: "2026-09-14T15:01:00.000Z", progress: "Filtrando os voos…" });

const statuses = ["queued", "running", "waiting", "done", "failed", "cancel"] as const;
const stepCases = [
  [],
  steps,
  steps.map((step) => ({ ...step, status: "done" })),
  [{ id: "s1", agent: "router", label: "Só um passo", status: "running" }],
  [{ id: "s1", agent: "router", label: "Falhou aqui", status: "failed" }, { id: "s2", agent: "writer", label: "Nem começou", status: "queued" }],
];
const FAILURE_CODES = [
  "invalid_input",
  "forbidden",
  "limit_reached",
  "conflict",
  "unavailable",
  "cancelled",
  "internal",
  "connection_lost",
  "connection_failed",
  "session_expired",
] as const;
const ARTIFACT_TYPES = ["text", "food", "sleep", "training", "workout", "skill", "agent", "router"] as const;

/** Os nomes dos tipos de entrada, lidos do `KIND_NAMES` do web (o módulo é um `.tsx` com CSS, que o Node não importa). */
function kindNames(): Record<string, string> {
  const source = readFileSync(new URL("../../../apps/web/src/components/hub/agent-trace.tsx", import.meta.url), "utf8");
  const block = /export const KIND_NAMES[^=]*=\s*\{([^}]*)\}/.exec(source)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

export function agentRequestFixtures(): Record<string, unknown> {
  const detail = taskDetailFixtures();
  const agentTask = detail["task-detail-agent"] as Record<string, unknown>;
  return {
    "request-running": running,
    "request-done": done,
    "request-failed": request({ ...running, status: "failed", errorCode: "limit_reached", progress: undefined }),
    "request-failed-bare": request({ ...running, status: "failed", progress: undefined }),
    "request-cancelled": request({ ...running, status: "cancel", progress: undefined }),
    "request-waiting": request({ ...running, status: "waiting", progress: undefined }),
    "request-queued": request({ id: "task-agent", status: "queued" }),
    "request-bare": request({ id: "task-agent", status: "running", trace: undefined }),
    "request-no-progress": request({ ...running, progress: undefined }),
    "request-first": first,
    "request-follow-running": follow,
    "request-follow-done": request({ ...follow, status: "done", progress: undefined }),
    "request-follow-failed": request({ ...follow, status: "failed", errorCode: "unavailable", progress: undefined }),
    "request-accepted": { requestId: "req-new" },
    "task-detail-agent-linked": { ...agentTask, parentTaskId: "task-parent", subtaskIds: ["task-sub-1"] },
    "task-detail-agent-done": { ...agentTask, status: "done", finishedAt: "2026-09-14T14:58:00.000Z", revision: 2 },
    "agent-request-text": {
      open: statuses.map((status) => ({ status, open: isOpenRequest(status) })),
      steps: stepCases.map((list) => {
        const parsed = requestSchema.shape.steps.parse(list);
        return { steps: parsed, progress: stepProgress(parsed), running: runningStepLabel({ steps: parsed }) ?? null };
      }),
      entries: entries.map((entry) => ({ entry, text: entryText(entry as never) })),
      operations: ["create", "update", "delete"].map((operation) => ({ operation, label: entityOperationLabel(operation as never) })),
      entities: [
        ...entities,
        ...ARTIFACT_TYPES.map((artifactType) => ({ kind: "artifact", id: `a-${artifactType}`, name: artifactType, artifactType, operation: "create", linkedTo: [] })),
      ].map((entity) => ({ entity, label: entityKindLabel(entity as never) })),
      failures: FAILURE_CODES.map((code) => ({ code, text: agentFailureText(code) })),
      kinds: kindNames(),
    },
  };
}
