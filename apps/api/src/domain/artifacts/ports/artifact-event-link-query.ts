import type { Actor, EventArtifactRelationKind, EventKind } from "../../sets";

/** Um evento vivo em que o artefato aparece, com o necessario para listar. */
export interface ArtifactEventLink {
  eventId: string;
  relation: EventArtifactRelationKind;
  name: string;
  actor: Actor;
  kind: EventKind;
  startedAt?: Date;
  estimatedFinishAt?: Date;
}

export interface ArtifactEventLinkQuery {
  /**
   * Os eventos vivos em que cada artefato aparece, do mais antigo ao mais novo;
   * os sem inicio vem no fim. Os passos de agente ficam de fora. Artefato sem
   * evento nao tem chave.
   */
  linksOf(artifactIds: readonly string[]): Promise<Map<string, ArtifactEventLink[]>>;
}
