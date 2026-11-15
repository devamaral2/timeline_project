import type { ArtifactDto, ArtifactType, EventArtifactDto } from "@repo/contracts";

/** A relação de um artefato com o evento, como a API a guarda. */
export type ArtifactRelation = EventArtifactDto["relation"];

/**
 * Um artefato na lista de edição do evento: o que a lista mostra (nome, tipo, se é do catálogo global) e a
 * relação. O `Salvar` manda só `id` e `relation`, na ordem da lista.
 */
export interface DraftArtifact {
  id: string;
  name: string;
  type: ArtifactType;
  global: boolean;
  relation: ArtifactRelation;
}

/** Os artefatos do evento lido, na ordem da API. */
export function draftArtifactsFromEvent(links: readonly EventArtifactDto[]): DraftArtifact[] {
  return links.map(({ artifact, relation }) => ({
    id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    global: artifact.global,
    relation,
  }));
}

/** O artefato escolhido na busca entra no fim da lista, com a relação `uses`. Se já está na lista, nada muda. */
export function addDraftArtifact(list: readonly DraftArtifact[], artifact: ArtifactDto): DraftArtifact[] {
  if (list.some((item) => item.id === artifact.id)) return [...list];
  return [...list, { id: artifact.id, name: artifact.name, type: artifact.type, global: artifact.global, relation: "uses" }];
}

/** Tira a ligação da lista. O artefato em si não é apagado: isso não sai daqui. */
export function removeDraftArtifact(list: readonly DraftArtifact[], id: string): DraftArtifact[] {
  return list.filter((item) => item.id !== id);
}

/**
 * Sobe (`-1`) ou desce (`1`) um artefato trocando com o vizinho que tem posição. O que o evento criou
 * (`creates`) fica na lista sem número e não se move; os de posição pulam por cima dele.
 */
export function moveDraftArtifact(list: readonly DraftArtifact[], id: string, step: -1 | 1): DraftArtifact[] {
  const index = list.findIndex((item) => item.id === id);
  const current = list[index];
  if (!current || current.relation === "creates") return [...list];
  const positioned = list.flatMap((item, at) => (item.relation === "creates" ? [] : [at]));
  const target = positioned[positioned.indexOf(index) + step];
  const other = target === undefined ? undefined : list[target];
  if (target === undefined || !other) return [...list];
  const next = [...list];
  next[index] = other;
  next[target] = current;
  return next;
}

/** O número de cada linha: 1, 2, … para os de posição; `null` para o que o evento criou. */
export function draftArtifactPositions(list: readonly DraftArtifact[]): (number | null)[] {
  let next = 0;
  return list.map((item) => (item.relation === "creates" ? null : ++next));
}

/** A lista como o `PATCH` do evento a manda: a ordem da tela, com a relação de cada um. */
export function artifactLinkInputs(list: readonly DraftArtifact[]): { id: string; relation: ArtifactRelation }[] {
  return list.map(({ id, relation }) => ({ id, relation }));
}

/** Os mesmos artefatos, na mesma ordem e com as mesmas relações. */
export function sameArtifactLinks(a: readonly DraftArtifact[], b: readonly DraftArtifact[]): boolean {
  return a.length === b.length && a.every((item, index) => item.id === b[index]?.id && item.relation === b[index]?.relation);
}
