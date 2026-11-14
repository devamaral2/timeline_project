import type { Artifact } from "../entities/artifact.entity";

export interface ArtifactRepository {
  save(artifact: Artifact): Promise<void>;
  update(artifact: Artifact, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(artifactId: string, actorUserId: string): Promise<void>;
  findById(artifactId: string): Promise<Artifact | null>;
  /** Os artefatos que existem e nao foram apagados; ids ausentes ficam de fora, e a ordem nao e a dos ids. */
  findByIds(artifactIds: readonly string[]): Promise<Artifact[]>;
  /** Os artefatos do usuario, do editado mais recentemente para o mais antigo, sem as copias. */
  listByUserId(userId: string, filter?: { types?: readonly string[] }): Promise<Artifact[]>;
  /** Os artefatos globais de um tipo, por nome. */
  listGlobal(type: string): Promise<Artifact[]>;
}
