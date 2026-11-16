import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EntityBatchWriter, TaskRepository } from "../../domain/ports";
import type { CreateArtifactRequest } from "@repo/contracts";
import { planArtifactLinks, uniqueIds } from "../../api-core/artifacts/artifact-targets";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";

export class CreateArtifactUseCase {
  constructor(
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly taskRepository: Pick<TaskRepository, "findByIds">,
    private readonly batchWriter: EntityBatchWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * O artefato e as tarefas em que ele ja nasce aparecendo entram numa
   * transacao so: ou ele nasce aparecendo onde foi pedido, ou nao nasce.
   */
  async execute(input: CreateArtifactRequest, actor: AuthenticatedUser): Promise<{ artifactId: string }> {
    const { taskIds, ...artifactInput } = input;
    const artifact = await this.artifactBuilder.fromCreateInput(artifactInput, actor.userId, this.clock());
    // A tarefa em que o artefato nasce e o que o cria.
    const tasks = await planArtifactLinks(artifact.id, [], uniqueIds(taskIds), this.taskRepository, actor.userId, "creates");

    await this.batchWriter.commit({ userId: actor.userId, tasks: tasks, artifacts: [{ op: "create", entity: artifact }] });
    return { artifactId: artifact.id };
  }
}
