/**
 * Fixtures da criação, edição e exclusão de documentos: os corpos de `POST /api/artifacts` e `PATCH /api/artifacts/{id}`
 * passam pelos schemas do contrato (`createArtifactRequestSchema`, `updateArtifactRequestSchema`) e a resposta da
 * criação por `createArtifactResponseSchema`. O teste do app confere que as requisições que o ViewModel manda são
 * iguais a elas. As tarefas de pessoa que a folha "Tarefas" oferece vêm da lista (`GET /api/tasks/tracked`) e da agenda
 * em volta de hoje (`GET /api/tasks`), como o `searchHumanTasks` do web.
 */
import {
  agendaPageSchema,
  artifactSchema,
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  taskCardSchema,
  updateArtifactRequestSchema,
} from "../../../packages/contracts/src/schemas";
import { PERSONAL_PROJECT } from "./project";

/** Um cartão de tarefa de pessoa, como a lista e a agenda servem. */
function humanCard(input: Record<string, unknown> & { id: string; name: string }) {
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

const planning = humanCard({ id: "task-1", name: "Reunião de planejamento", status: "todo", startedAt: "2026-09-14T12:00:00.000Z" });
const gifts = humanCard({ id: "task-9", name: "Comprar presentes", status: "todo", startedAt: "2026-09-16T12:00:00.000Z" });
const lunch = humanCard({ id: "task-10", name: "Almoço com a Ana", kind: "meal", startedAt: "2026-09-15T15:00:00.000Z" });
const gym = humanCard({ id: "task-11", name: "Academia", kind: "training", startedAt: "2026-09-13T10:00:00.000Z" });

export function documentEditFixtures(): Record<string, unknown> {
  return {
    "document-edit-create-note-request": createArtifactRequestSchema.parse({
      type: "text",
      name: "Ideias",
      tags: ["casa", "ideias"],
      data: { body: "## Plano\n\n- um\n- dois" },
    }),
    "document-edit-create-note-unnamed-request": createArtifactRequestSchema.parse({ type: "text", tags: [], data: { body: "Só o texto" } }),
    "document-edit-create-food-request": createArtifactRequestSchema.parse({ type: "food", data: { inputText: "Arroz, feijão e frango grelhado" } }),
    "document-edit-create-response": createArtifactResponseSchema.parse({ artifactId: "doc-new" }),
    "document-edit-create-note-with-tasks-request": createArtifactRequestSchema.parse({
      type: "text",
      tags: [],
      data: { body: "Lista de presentes" },
      taskIds: ["task-9", "task-10"],
    }),
    "document-edit-create-food-with-tasks-request": createArtifactRequestSchema.parse({
      type: "food",
      data: { inputText: "Arroz e feijão" },
      taskIds: ["task-10"],
    }),
    "document-edit-human-tracked": [planning, gifts],
    "document-edit-human-tracked-filtered": [],
    "document-edit-human-agenda": agendaPageSchema.parse({ items: [gifts, lunch, gym] }),
    "document-edit-update-request": updateArtifactRequestSchema.parse({
      expectedRevision: 1,
      name: "Ideias revisadas",
      tags: ["trabalho", "ideias"],
      type: "text",
      data: { body: "# Ideias\n\nTexto novo" },
    }),
    "document-edit-update-after-stale-request": updateArtifactRequestSchema.parse({
      expectedRevision: 4,
      name: "Ideias revisadas",
      tags: ["trabalho", "ideias"],
      type: "text",
      data: { body: "# Ideias\n\nTexto novo" },
    }),
    "document-edit-update-unnamed-request": updateArtifactRequestSchema.parse({
      expectedRevision: 1,
      tags: ["trabalho", "ideias"],
      type: "text",
      data: { body: "Sem nome" },
    }),
    "document-edit-update-news-after-stale-request": updateArtifactRequestSchema.parse({
      expectedRevision: 7,
      name: "Notícias da manhã",
      tags: ["leitura"],
      type: "news",
      data: { body: "Texto corrigido" },
    }),
    "document-edit-reread-news": artifactSchema.parse({
      schemaVersion: 1,
      id: "doc-news",
      name: "Notícias da manhã",
      type: "news",
      global: false,
      derived: false,
      tags: ["leitura"],
      revision: 7,
      createdAt: "2026-09-10T12:00:00.000Z",
      updatedAt: "2026-09-14T13:00:00.000Z",
      data: { body: "Mudou em outro lugar" },
    }),
    "document-edit-reread": artifactSchema.parse({
      schemaVersion: 1,
      id: "doc-text",
      name: "Ideias para o projeto",
      type: "text",
      global: false,
      derived: false,
      tags: ["trabalho", "ideias"],
      revision: 4,
      createdAt: "2026-09-10T12:00:00.000Z",
      updatedAt: "2026-09-14T13:00:00.000Z",
      data: { body: "Mudou em outro lugar" },
    }),
  };
}
