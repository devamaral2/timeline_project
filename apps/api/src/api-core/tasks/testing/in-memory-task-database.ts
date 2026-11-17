import { Task, TaskValidationError, type Artifact } from "../../../domain/index";
import type { SubtaskChange } from "../../../domain/ports";

/**
 * Estado compartilhado entre os repositorios e as consultas em memoria, para
 * que o que e gravado junto (a tarefa, os artefatos dela, as relacoes) apareca
 * nas leituras, como na transacao unica do Postgres.
 */
export class InMemoryTaskDatabase {
  tasks: Task[];
  /** Mutado no lugar: o `InMemoryArtifactRepository` compartilha esta mesma lista. */
  readonly artifacts: Artifact[];
  /** De qual original saiu cada copia. */
  readonly derivations: { originalId: string; copyId: string }[] = [];
  /** A hierarquia entre tarefas: `parentId` e a principal de `subtaskId`. */
  edges: { parentId: string; subtaskId: string }[] = [];

  constructor(tasks: Task[] = [], artifacts: Artifact[] = []) {
    this.tasks = [...tasks];
    this.artifacts = [...artifacts];
  }

  /**
   * Aplica as arestas como o escritor do Postgres: as pontas existem e sao do
   * usuario, a subtarefa sai da principal anterior e a hierarquia nao fecha ciclo.
   */
  apply(userId: string, changes: readonly SubtaskChange[]): void {
    for (const change of changes) {
      if (change.op === "remove") {
        this.edges = this.edges.filter((edge) => edge.parentId !== change.parentId || edge.subtaskId !== change.subtaskId);
        continue;
      }
      for (const id of [change.parentId, change.subtaskId]) {
        const found = this.tasks.find((task) => task.id === id && task.userId === userId);
        if (!found) throw new TaskValidationError(`Related tasks not found: ${id}`);
      }
      this.edges = this.edges.filter((edge) => edge.subtaskId !== change.subtaskId);
      this.edges.push({ parentId: change.parentId, subtaskId: change.subtaskId });
      if (this.reaches(change.subtaskId, change.parentId)) {
        throw new TaskValidationError("A task cannot be a subtask of its own subtask");
      }
    }
  }

  /** Descendo a hierarquia a partir de `fromId`, chega-se em `targetId`. */
  private reaches(fromId: string, targetId: string): boolean {
    const seen = new Set<string>();
    const queue = [fromId];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (id === targetId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of this.edges) if (edge.parentId === id) queue.push(edge.subtaskId);
    }
    return false;
  }

  /** A tarefa como o repositorio a devolve: com a hierarquia lida das arestas, sem as pontas apagadas. */
  hydrate(task: Task): Task {
    const live = (id: string) => this.tasks.some((other) => other.id === id);
    return Task.rehydrate({
      id: task.id,
      userId: task.userId,
      actor: task.actor,
      kind: task.kind,
      status: task.status,
      priority: task.priority,
      name: task.name,
      description: task.description,
      location: task.location,
      startedAt: task.startedAt,
      estimatedFinishAt: task.estimatedFinishAt,
      finishedAt: task.finishedAt,
      notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
      tags: [...task.tags],
      longRunning: task.longRunning,
      data: { ...task.data },
      artifactLinks: task.artifactLinks.filter((link) => this.artifacts.some((artifact) => artifact.id === link.artifactId)),
      parentId: this.edges.find((edge) => edge.subtaskId === task.id && live(edge.parentId))?.parentId,
      subtaskIds: this.edges.filter((edge) => edge.parentId === task.id && live(edge.subtaskId)).map((edge) => edge.subtaskId),
      occurrence: task.occurrence,
      revision: task.revision,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  }

  /** Os artefatos vivos de uma tarefa, na ordem das relacoes. */
  artifactsOf(task: Task): Artifact[] {
    return task.artifactLinks.flatMap((link) => {
      const artifact = this.artifacts.find((candidate) => candidate.id === link.artifactId);
      return artifact ? [artifact] : [];
    });
  }

  writeArtifacts(
    writes:
      | {
          created?: readonly Artifact[];
          updated?: readonly { artifact: Artifact }[];
          derivations?: readonly { originalId: string; copyId: string }[];
        }
      | undefined,
  ): void {
    for (const artifact of writes?.created ?? []) this.artifacts.push(artifact);
    for (const { artifact } of writes?.updated ?? []) {
      const index = this.artifacts.findIndex((stored) => stored.id === artifact.id);
      if (index !== -1) this.artifacts[index] = artifact;
    }
    this.derivations.push(...(writes?.derivations ?? []));
  }
}
