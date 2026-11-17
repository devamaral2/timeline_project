import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { TaskOwnershipError } from "../../domain/index";
import type { ArtifactRepository, TaskRepository, TaskRequestLinkQuery, RecurrenceRepository } from "../../domain/ports";
import type { TaskDto } from "@repo/contracts";
import { toTaskDto } from "../../api-core/dto/task.dto";

export class GetTaskUseCase {
  constructor(
    private readonly taskRepository: Pick<TaskRepository, "findById">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly recurrenceRepository: Pick<RecurrenceRepository, "findById">,
    private readonly requestLinks: TaskRequestLinkQuery,
  ) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<TaskDto | null> {
    const task = await this.taskRepository.findById(input.taskId);
    if (!task) return null;
    if (task.userId !== actor.userId) {
      throw new TaskOwnershipError();
    }

    const [artifacts, recurrence, requests] = await Promise.all([
      this.artifactRepository.findByIds(task.artifactLinks.map((link) => link.artifactId)),
      task.occurrence ? this.recurrenceRepository.findById(task.occurrence.recurrenceId) : null,
      this.requestLinks.linksOf(task.id),
    ]);
    return toTaskDto(task, artifacts, recurrence ?? undefined, requests);
  }
}
