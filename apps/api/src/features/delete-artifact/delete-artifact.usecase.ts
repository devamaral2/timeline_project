import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ArtifactOwnershipError, ArtifactValidationError, isAgentFileArtifactType, isRouterArtifactType } from "../../domain";
import type { ArtifactRepository } from "../../domain/ports";

export class DeleteArtifactUseCase {
  constructor(private readonly artifactRepository: Pick<ArtifactRepository, "findById" | "delete">) {}

  async execute(input: { artifactId: string }, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.artifactRepository.findById(input.artifactId);
    if (existing && existing.userId !== actor.userId) throw new ArtifactOwnershipError();
    // Os artefatos de skill e agente espelham arquivos da pasta (ADR 0005): quem os mantem e a API.
    if (existing && isAgentFileArtifactType(existing.type)) {
      throw new ArtifactValidationError("Skill and agent artifacts follow the files and cannot be deleted");
    }
    if (existing && isRouterArtifactType(existing.type)) {
      throw new ArtifactValidationError("Router artifacts follow the JEV config and cannot be deleted");
    }
    await this.artifactRepository.delete(input.artifactId, actor.userId);
  }
}
