import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { TaskOwnershipError } from "../../domain/index";
import type {
  ArtifactRepository,
  ProjectQuery,
  TaskRepository,
  TaskRequestLinkQuery,
  RecurrenceRepository,
} from "../../domain/ports";
import type { TaskDto } from "@repo/contracts";
import { toTaskDto } from "../../api-core/dto/task.dto";

export class GetTaskUseCase {
  constructor(
    private readonly taskRepository: Pick<TaskRepository, "findById">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly recurrenceRepository: Pick<RecurrenceRepository, "findById">,
    private readonly requestLinks: TaskRequestLinkQuery,
    private readonly projects: Pick<ProjectQuery, "ofTasks">,
  ) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<TaskDto | null> {
    const task = await this.taskRepository.findById(input.taskId);
    if (!task) return null;
    if (task.userId !== actor.userId) {
      throw new TaskOwnershipError();
    }

    const [artifacts, recurrence, requests, projects] = await Promise.all([
      this.artifactRepository.findByIds(task.artifactLinks.map((link) => link.artifactId)),
      task.occurrence ? this.recurrenceRepository.findById(task.occurrence.recurrenceId) : null,
      this.requestLinks.linksOf(task.id),
      this.projects.ofTasks([task.id]),
    ]);
    const project = projects.get(task.id);
    if (!project) throw new Error(`Task ${task.id} has no project`);
    return toTaskDto(task, project, artifacts, recurrence ?? undefined, requests);
  }
}
