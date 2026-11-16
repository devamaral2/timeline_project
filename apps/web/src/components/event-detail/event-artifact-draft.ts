import type { ArtifactDto, ArtifactType, TaskArtifactDto } from "@repo/contracts";

/** A relação de um artefato com o evento, como a API a guarda. */
export type ArtifactRelation = TaskArtifactDto["relation"];

/**
 * Um artefato na lista de edição do evento: o que a lista mostra (nome, tipo, se é do catálogo global) e a
 * relação. O `Salvar` manda só `id` e `relation`, na ordem da lista.
 */
export interface DraftArtifact {
  /** O id do artefato ligado. Numa cópia nova, é só a chave da linha: a API não a recebe. */
  id: string;
  name: string;
  type: ArtifactType;
  global: boolean;
  relation: ArtifactRelation;
  /** Cópia nova de um alimento: o id do original. Vai à API como `copyOf`, no lugar de `id` e `relation`. */
  copyOf?: string;
  /** A quantidade do alimento, como texto (o contrato guarda string). Só a cópia nova pode mudá-la. */
  quantity?: string;
}

/** Uma entrada da lista de artefatos do `PATCH`: um artefato ligado (`id`, `relation`) ou uma cópia nova de alimento. */
export type ArtifactLinkInput = { id: string; relation: ArtifactRelation } | { copyOf: string; quantity?: string };

/** Os artefatos do evento lido, na ordem da API. Um alimento que já é cópia do evento mostra a quantidade que tem. */
export function draftArtifactsFromEvent(links: readonly TaskArtifactDto[]): DraftArtifact[] {
  return links.map(({ artifact, relation }) => {
    const item: DraftArtifact = {
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      global: artifact.global,
      relation,
    };
    if (artifact.type === "food" && artifact.data.quantity) item.quantity = artifact.data.quantity;
    return item;
  });
}

/** O artefato escolhido na busca entra no fim da lista, com a relação `uses`. Se já está na lista, nada muda. */
export function addDraftArtifact(list: readonly DraftArtifact[], artifact: ArtifactDto): DraftArtifact[] {
  if (list.some((item) => item.id === artifact.id)) return [...list];
  return [...list, { id: artifact.id, name: artifact.name, type: artifact.type, global: artifact.global, relation: "uses" }];
}

/**
 * O alimento escolhido entra no fim como cópia nova: `key` é a chave da linha (não vai à API), e a cópia leva o id
 * do original. Escolher o mesmo alimento de novo acrescenta outra cópia, com a sua quantidade.
 */
export function addFoodCopy(list: readonly DraftArtifact[], food: ArtifactDto, key: string): DraftArtifact[] {
  return [...list, { id: key, name: food.name, type: food.type, global: food.global, relation: "uses", copyOf: food.id }];
}

/** Muda a quantidade de uma cópia nova. Os alimentos que já estão no evento não mudam aqui. */
export function setCopyQuantity(list: readonly DraftArtifact[], key: string, quantity: string): DraftArtifact[] {
  return list.map((item) => (item.id === key && item.copyOf !== undefined ? { ...item, quantity } : item));
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

/**
 * A lista como o `PATCH` do evento a manda: a ordem da tela. Um artefato ligado vai com id e relação; uma cópia
 * nova vai com `copyOf` e a quantidade, se houver (sem espaços nas pontas), sem relação.
 */
export function artifactLinkInputs(list: readonly DraftArtifact[]): ArtifactLinkInput[] {
  return list.map((item) => {
    if (item.copyOf === undefined) return { id: item.id, relation: item.relation };
    const quantity = item.quantity?.trim();
    return quantity ? { copyOf: item.copyOf, quantity } : { copyOf: item.copyOf };
  });
}

/** Os mesmos artefatos, na mesma ordem, com as mesmas relações, cópias e quantidades. */
export function sameArtifactLinks(a: readonly DraftArtifact[], b: readonly DraftArtifact[]): boolean {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index];
    return item.id === other?.id && item.relation === other.relation && item.copyOf === other.copyOf && item.quantity === other.quantity;
  });
}
