/**
 * Fixtures da criação, edição e exclusão de documentos: os corpos de `POST /api/artifacts` e `PATCH /api/artifacts/{id}`
 * passam pelos schemas do contrato (`createArtifactRequestSchema`, `updateArtifactRequestSchema`) e a resposta da
 * criação por `createArtifactResponseSchema`. O teste do app confere que as requisições que o ViewModel manda são
 * iguais a elas.
 */
import {
  artifactSchema,
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  updateArtifactRequestSchema,
} from "../../../packages/contracts/src/schemas";

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
