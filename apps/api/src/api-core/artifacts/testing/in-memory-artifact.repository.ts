import type { ArtifactRepository } from "../../../domain/ports";
import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  type Artifact,
} from "../../../domain";

/** `artifacts` pode ser a lista do `InMemoryTaskDatabase`, para que os dois enxerguem os mesmos artefatos. */
export class InMemoryArtifactRepository implements ArtifactRepository {
  constructor(private readonly artifacts: Artifact[] = []) {}

  async save(artifact: Artifact): Promise<void> {
    this.artifacts.push(artifact);
  }

  async update(artifact: Artifact, actorUserId: string, expectedRevision: number): Promise<void> {
    const index = this.artifacts.findIndex((stored) => stored.id === artifact.id);
    if (index === -1) throw new ArtifactNotFoundError(`Artifact not found: ${artifact.id}`);

    const existing = this.artifacts[index] as Artifact;
    if (existing.userId !== actorUserId) throw new ArtifactOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new ArtifactRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }
    this.artifacts[index] = artifact;
  }

  async delete(artifactId: string, actorUserId: string): Promise<void> {
    const index = this.artifacts.findIndex((stored) => stored.id === artifactId);
    if (index === -1) throw new ArtifactNotFoundError(`Artifact not found: ${artifactId}`);
    if ((this.artifacts[index] as Artifact).userId !== actorUserId) throw new ArtifactOwnershipError();
    this.artifacts.splice(index, 1);
  }

  async findById(artifactId: string): Promise<Artifact | null> {
    return this.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
  }

  async findByIds(artifactIds: readonly string[]): Promise<Artifact[]> {
    return this.artifacts.filter((artifact) => artifactIds.includes(artifact.id));
  }

  async listByUserId(userId: string, filter?: { types?: readonly string[] }): Promise<Artifact[]> {
    return this.artifacts
      .filter((artifact) => artifact.userId === userId && !artifact.derived)
      .filter((artifact) => !filter?.types?.length || filter.types.includes(artifact.type))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id));
  }

  async listGlobal(type: string): Promise<Artifact[]> {
    return this.artifacts
      .filter((artifact) => artifact.isGlobal && artifact.type === type)
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}
