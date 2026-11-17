import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { ArtifactType } from "../../domain";
import type { ArtifactTaskLinkQuery, ArtifactRepository } from "../../domain/ports";
import type { ArtifactDto } from "@repo/contracts";
import { toArtifactDto } from "../../api-core/dto/artifact.dto";

export interface ListArtifactsFilter {
  type?: ArtifactType;
  /** `global`: os artefatos sem dono de um tipo (alimentos e exercicios), por nome. Ausente, os do usuario. */
  scope?: "global";
  tag?: string;
  /** Busca no nome e, nos artefatos de texto, no corpo. Ja normalizada (minuscula). */
  q?: string;
  /** Somente os artefatos que aparecem neste tarefa. */
  taskId?: string;
  limit?: number;
}

export function filterArtifacts(artifacts: ArtifactDto[], filter: ListArtifactsFilter): ArtifactDto[] {
  const matching = artifacts.filter((artifact) => {
    if (filter.tag && !artifact.tags.includes(filter.tag)) return false;
    if (filter.q) {
      const body = artifact.type === "text" || artifact.type === "router" ? artifact.data.body : "";
      if (!`${artifact.name}\n${body}`.toLowerCase().includes(filter.q)) return false;
    }
    if (filter.taskId && !(artifact.tasks ?? []).some((link) => link.taskId === filter.taskId)) return false;
    return true;
  });
  return filter.limit === undefined ? matching : matching.slice(0, filter.limit);
}

/** Os artefatos do usuario, do editado mais recentemente para o mais antigo, sem as copias feitas para tarefas. */
export class ListArtifactsUseCase {
  constructor(
    private readonly artifactRepository: Pick<ArtifactRepository, "listByUserId" | "listGlobal">,
    private readonly linkQuery: ArtifactTaskLinkQuery,
  ) {}

  async execute(input: ListArtifactsFilter | undefined, actor: AuthenticatedUser): Promise<ArtifactDto[]> {
    const filter = input ?? {};
    if (filter.scope === "global") {
      const globals = filter.type ? await this.artifactRepository.listGlobal(filter.type) : [];
      return filterArtifacts(globals.map((artifact) => toArtifactDto(artifact, [])), filter);
    }

    const artifacts = await this.artifactRepository.listByUserId(
      actor.userId,
      filter.type ? { types: [filter.type] } : undefined,
    );
    const links = await this.linkQuery.linksOf(artifacts.map((artifact) => artifact.id));
    return filterArtifacts(
      artifacts.map((artifact) => toArtifactDto(artifact, links.get(artifact.id) ?? [])),
      filter,
    );
  }
}
