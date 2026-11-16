import { Task, TaskValidationError, type Artifact } from "../../../domain/index";
import type { SequenceChange } from "../../../domain/ports";

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
  /** A sequencia entre tarefas: `fromId` vem antes de `toId`. */
  edges: { fromId: string; toId: string }[] = [];

  constructor(tasks: Task[] = [], artifacts: Artifact[] = []) {
    this.tasks = [...tasks];
    this.artifacts = [...artifacts];
  }

  /** Aplica as arestas como o escritor do Postgres: as pontas existem e sao do usuario, e a ordem nao fecha ciclo. */
  apply(userId: string, changes: readonly SequenceChange[]): void {
    for (const change of changes) {
      if (change.op === "remove") {
        this.edges = this.edges.filter((edge) => edge.fromId !== change.fromId || edge.toId !== change.toId);
        continue;
      }
      for (const id of [change.fromId, change.toId]) {
        const found = this.tasks.find((task) => task.id === id && task.userId === userId);
        if (!found) throw new TaskValidationError(`Related tasks not found: ${id}`);
      }
      if (!this.edges.some((edge) => edge.fromId === change.fromId && edge.toId === change.toId)) {
        this.edges.push({ fromId: change.fromId, toId: change.toId });
      }
      if (this.reaches(change.toId, change.fromId)) {
        throw new TaskValidationError("Tasks cannot follow each other in a cycle");
      }
    }
  }

  /** Seguindo a sequencia a partir de `fromId`, chega-se em `targetId`. */
  private reaches(fromId: string, targetId: string): boolean {
    const seen = new Set<string>();
    const queue = [fromId];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (id === targetId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of this.edges) if (edge.fromId === id) queue.push(edge.toId);
    }
    return false;
  }

  /** A tarefa como o repositorio o devolve: com a sequencia lida das arestas, sem as pontas apagadas. */
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
      previousIds: this.edges.filter((edge) => edge.toId === task.id && live(edge.fromId)).map((edge) => edge.fromId),
      nextIds: this.edges.filter((edge) => edge.fromId === task.id && live(edge.toId)).map((edge) => edge.toId),
      occurrence: task.occurrence,
      revision: task.revision,
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
