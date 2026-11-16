import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  ArtifactValidationError,
  isAgentFileArtifactType,
  isRouterArtifactType,
} from "../../domain";
import type { ArtifactTaskLinkQuery, ArtifactRepository, EntityBatchWriter, TaskRepository } from "../../domain/ports";
import type { UpdateArtifactRequest } from "@repo/contracts";
import { planArtifactLinks, uniqueIds } from "../../api-core/artifacts/artifact-targets";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";

export class UpdateArtifactUseCase {
  constructor(
    private readonly artifactRepository: Pick<ArtifactRepository, "findById">,
    private readonly linkQuery: ArtifactTaskLinkQuery,
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly taskRepository: Pick<TaskRepository, "findByIds">,
    private readonly batchWriter: EntityBatchWriter,
  ) {}

  /** O conteudo e as tarefas em que o artefato aparece mudam numa transacao so. */
  async execute(input: UpdateArtifactRequest, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.artifactRepository.findById(input.artifactId);
    if (!existing) throw new ArtifactNotFoundError(`Artifact not found: ${input.artifactId}`);
    if (existing.userId !== actor.userId) throw new ArtifactOwnershipError();
    // O texto vive no arquivo; o artefato so o referencia. Mudar o arquivo e pedir ao Hermes (ADR 0005).
    if (isAgentFileArtifactType(existing.type)) {
      throw new ArtifactValidationError("Skill and agent artifacts follow the files; ask Hermes to change the file");
    }
    if (isRouterArtifactType(existing.type)) {
      throw new ArtifactValidationError("Router artifacts follow the JEV config and cannot be edited");
    }
    if (existing.revision !== input.expectedRevision) {
      throw new ArtifactRevisionConflictError(
        `Expected revision ${input.expectedRevision} but found ${existing.revision}`,
      );
    }

    const resolved = input.data !== undefined ? await this.artifactBuilder.resolveUpdateData(input) : undefined;
    const edits = input.name !== undefined || input.tags !== undefined || resolved !== undefined;
    const revised = edits
      ? existing.revise({
          name: input.name?.trim() || undefined,
          tags: input.tags,
          type: resolved?.type,
          schemaVersion: "schemaVersion" in input ? input.schemaVersion : undefined,
          data: resolved?.data,
        })
      : undefined;

    // So as tarefas de pessoa entram na lista: os pedidos ao agente que tocaram o artefato nao sao editados por aqui.
    const links = (await this.linkQuery.linksOf([existing.id])).get(existing.id) ?? [];
    const current = links.filter((link) => link.actor === "human").map((link) => link.taskId);
    const desired = input.taskIds !== undefined ? uniqueIds(input.taskIds) : current;
    const tasks = await planArtifactLinks(existing.id, current, desired, this.taskRepository, actor.userId);

    if (!revised && tasks.length === 0) return;
    await this.batchWriter.commit({
      userId: actor.userId,
      tasks: tasks,
      artifacts: revised ? [{ op: "update", entity: revised, expectedRevision: existing.revision }] : [],
    });
  }
}
