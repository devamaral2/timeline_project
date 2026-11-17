import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ArtifactOwnershipError } from "../../domain";
import type { ArtifactTaskLinkQuery, ArtifactRepository } from "../../domain/ports";
import type { ArtifactDto } from "@repo/contracts";
import { toArtifactDto } from "../../api-core/dto/artifact.dto";

export class GetArtifactUseCase {
  constructor(
    private readonly artifactRepository: Pick<ArtifactRepository, "findById">,
    private readonly linkQuery: ArtifactTaskLinkQuery,
  ) {}

  /** Um artefato global e de todos: qualquer usuario le, sem as tarefas dos outros. */
  async execute(input: { artifactId: string }, actor: AuthenticatedUser): Promise<ArtifactDto | null> {
    const artifact = await this.artifactRepository.findById(input.artifactId);
    if (!artifact) return null;
    if (artifact.isGlobal) return toArtifactDto(artifact, []);
    if (artifact.userId !== actor.userId) throw new ArtifactOwnershipError();

    const links = await this.linkQuery.linksOf([artifact.id]);
    return toArtifactDto(artifact, links.get(artifact.id) ?? []);
  }
}
