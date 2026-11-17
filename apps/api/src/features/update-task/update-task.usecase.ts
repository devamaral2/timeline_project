import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { TaskNotFoundError, TaskOwnershipError, TaskRevisionConflictError } from "../../domain/index";
import type { ArtifactRepository, EntityBatchWriter, TaskRepository } from "../../domain/ports";
import type { UpdateTaskInput } from "@repo/contracts";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { mergeTaskUpdate, toUpdateBatch } from "../../api-core/tasks/services/task-update-merger.service";

export class UpdateTaskUseCase {
  constructor(
    private readonly taskRepository: Pick<TaskRepository, "findById" | "findByIds">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly batchWriter: EntityBatchWriter,
  ) {}

  /** A tarefa, os artefatos editados e as tarefas de origem das relacoes mudam numa transacao so. */
  async execute(input: UpdateTaskInput, actor: AuthenticatedUser): Promise<void> {
    const existingTask = await this.taskRepository.findById(input.taskId);
    if (!existingTask) throw new TaskNotFoundError(`Task not found: ${input.taskId}`);
    if (existingTask.userId !== actor.userId) throw new TaskOwnershipError();
    if (existingTask.revision !== input.expectedRevision) {
      throw new TaskRevisionConflictError(
        `Expected revision ${input.expectedRevision} but found ${existingTask.revision}`,
      );
    }

    const merged = await mergeTaskUpdate(existingTask, input, {
      artifactBuilder: this.artifactBuilder,
      artifactRepository: this.artifactRepository,
      taskRepository: this.taskRepository,
    });
    await this.batchWriter.commit(toUpdateBatch(merged, input.expectedRevision));
  }
}
