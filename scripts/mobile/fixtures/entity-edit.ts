/**
 * Fixtures da edição por IA nos detalhes (ticket 20): as respostas de `POST /api/requests/edit` e de
 * `GET /api/requests/{id}` validadas pelo `requestSchema`, e as saídas das funções do web que a barra usa
 * (`EDIT_TARGET_LABELS`, `editEntityTypeOfArtifact`, `isModelCommand`, `pendingMealEditMessage`).
 */
import { requestSchema } from "../../../packages/contracts/src/schemas";
import { EDIT_TARGET_LABELS, editEntityTypeOfArtifact, isModelCommand } from "../../../apps/web/src/lib/entity-edit/entity-edit-target";
import { pendingMealEditMessage } from "../../../apps/web/src/lib/notes/meal-generation";

const ARTIFACT_TYPES = ["text", "food", "sleep", "training", "workout", "skill", "agent", "router"] as const;
const MODEL_COMMAND_TEXTS = ["/model", "/MODEL", "  /Model  ", "/modelo", "/models", "/model haiku", "model", "/", "mude o /model", ""];

function edit(input: Record<string, unknown> & { id: string }) {
  return requestSchema.parse({
    kind: "request",
    route: "steps",
    status: "running",
    title: "Editar a tarefa",
    createdAt: "2026-09-14T14:48:00.000Z",
    updatedAt: "2026-09-14T14:49:00.000Z",
    steps: [],
    entities: [],
    ...input,
  });
}

export function entityEditFixtures(): Record<string, unknown> {
  const changed = [{ kind: "task", id: "task-1", name: "Reunião de planejamento", operation: "update", linkedTo: [] }];
  return {
    "entity-edit-accepted": { requestId: "req-ed" },
    "entity-edit-queued": edit({ id: "req-ed", status: "queued" }),
    "entity-edit-running": edit({ id: "req-ed", progress: "Ajustando a tarefa…" }),
    "entity-edit-running-steps": edit({
      id: "req-ed",
      steps: [
        { id: "s1", agent: "router", label: "Entender o pedido", status: "done" },
        { id: "s2", agent: "tasks", label: "Mudar o horário", status: "running" },
        { id: "s3", agent: "writer", label: "Conferir a agenda", status: "queued" },
      ],
    }),
    "entity-edit-done": edit({ id: "req-ed", status: "done", message: "Pronto: movi a reunião para as 15h.", entities: changed }),
    "entity-edit-done-bare": edit({ id: "req-ed", status: "done", message: "Nada a mudar." }),
    "entity-edit-failed": edit({ id: "req-ed", status: "failed", errorCode: "limit_reached" }),
    "entity-edit-failed-bare": edit({ id: "req-ed", status: "failed" }),
    "entity-edit-cancelled": edit({ id: "req-ed", status: "cancel" }),
    "entity-edit-model": {
      targets: Object.entries(EDIT_TARGET_LABELS).map(([type, label]) => ({ type, label })),
      artifacts: ARTIFACT_TYPES.flatMap((type) =>
        [false, true].map((global) => ({ type, global, entityType: editEntityTypeOfArtifact({ type, global }) })),
      ),
      pendingMealMessage: pendingMealEditMessage,
      modelCommands: MODEL_COMMAND_TEXTS.map((text) => ({ text, command: isModelCommand(text) })),
    },
  };
}
