/**
 * Os conjuntos de tipos de artefato que guardam texto, únicos para o web, a API e o MCP (spec #70). É JS de verdade
 * (o `index.ts` só tem tipos), por isso tem o subpath `@repo/contracts/artifact-types`. O Android repete os dois
 * conjuntos no domínio (`domain/artifact`).
 *
 * São duas perguntas diferentes:
 * - "é de texto livre?": a pessoa lê e edita como nota (editor, edição por IA, dono do texto);
 * - "tem corpo em markdown?": dá para mostrar e buscar o texto. Vale também para o roteador, que tem o mesmo dado
 *   mas segue um arquivo do agente e por isso não se edita como nota.
 *
 * Um tipo novo com o dado da nota entra em `FREE_TEXT_ARTIFACT_TYPES` e passa a valer nas duas.
 */
import type { ArtifactType } from "./artifacts/artifact.dto";

/** Os tipos de texto livre: os que a pessoa lê e edita como nota. */
export const FREE_TEXT_ARTIFACT_TYPES = ["text"] as const satisfies readonly ArtifactType[];
export type FreeTextArtifactType = (typeof FREE_TEXT_ARTIFACT_TYPES)[number];

/** Os tipos cujo dado é `{ body }` em markdown: os de texto livre e o roteador. */
export const TEXT_BODY_ARTIFACT_TYPES = [...FREE_TEXT_ARTIFACT_TYPES, "router"] as const satisfies readonly ArtifactType[];
export type TextBodyArtifactType = (typeof TEXT_BODY_ARTIFACT_TYPES)[number];

export function isFreeTextArtifactType(type: unknown): type is FreeTextArtifactType {
  return (FREE_TEXT_ARTIFACT_TYPES as readonly unknown[]).includes(type);
}

export function isTextBodyArtifactType(type: unknown): type is TextBodyArtifactType {
  return (TEXT_BODY_ARTIFACT_TYPES as readonly unknown[]).includes(type);
}

/** O artefato é de texto livre: estreita a união para as variantes que têm `data.body` e que a pessoa edita. */
export function isFreeTextArtifact<T extends { type: string }>(artifact: T): artifact is Extract<T, { type: FreeTextArtifactType }> {
  return isFreeTextArtifactType(artifact.type);
}

/** O artefato tem corpo em markdown: estreita a união para as variantes com `data.body`. */
export function hasTextBody<T extends { type: string }>(artifact: T): artifact is Extract<T, { type: TextBodyArtifactType }> {
  return isTextBodyArtifactType(artifact.type);
}
