import type { Actor, TaskArtifactRelationKind, TaskKind } from "../../sets";

/** Uma tarefa viva em que o artefato aparece, com o necessario para listar. */
export interface ArtifactTaskLink {
  taskId: string;
  relation: TaskArtifactRelationKind;
  name: string;
  actor: Actor;
  kind: TaskKind;
  startedAt?: Date;
  estimatedFinishAt?: Date;
}

export interface ArtifactTaskLinkQuery {
  /**
   * As tarefas vivas em que cada artefato aparece, do mais antigo ao mais novo;
   * as sem inicio vem no fim. Os passos de agente ficam de fora. Artefato sem
   * tarefa nao tem chave.
   */
  linksOf(artifactIds: readonly string[]): Promise<Map<string, ArtifactTaskLink[]>>;
}
