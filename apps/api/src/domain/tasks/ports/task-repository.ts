import type { ArtifactWrites } from "../../artifacts/types/artifact-writes";
import type { Task } from "../entities/task.entity";

/**
 * Cada tarefa e gravada por si, com o inicio e o fim que o usuario disse: no
 * passado, agora ou no futuro. As relacoes que saem da tarefa (artefatos,
 * subtarefas, bloqueios) sao gravadas com ele.
 */
export interface TaskRepository {
  /** `artifacts`: os artefatos que nascem com a tarefa, gravados antes e na mesma transacao dela. */
  save(task: Task, artifacts?: ArtifactWrites): Promise<void>;
  update(task: Task, actorUserId: string, expectedRevision: number, artifacts?: ArtifactWrites): Promise<void>;
  delete(taskId: string, actorUserId: string): Promise<void>;
  findById(taskId: string): Promise<Task | null>;
  /** As tarefas que existem e nao foram apagadas; ids ausentes ficam de fora, e a ordem nao e a dos ids. */
  findByIds(taskIds: readonly string[]): Promise<Task[]>;
}
