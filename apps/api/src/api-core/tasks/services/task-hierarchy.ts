import { TaskNotFoundError, TaskOwnershipError, TaskValidationError } from "../../../domain/index";
import type { TaskRepository, SubtaskChange } from "../../../domain/ports";

/** Onde uma tarefa esta hoje na hierarquia: a principal dela e as subtarefas. */
export interface HierarchyOfTask {
  parentId: string | undefined;
  subtaskIds: readonly string[];
}

/** O que o pedido quer. Ausente nao muda aquele lado; `parentId: null` tira a tarefa de baixo da principal. */
export interface DesiredHierarchy {
  parentId?: string | null;
  subtaskIds?: readonly string[];
}

/**
 * As arestas a gravar para que `taskId` fique sob `desired.parentId` e tenha
 * como subtarefas exatamente `desired.subtaskIds`, dado onde ela esta hoje
 * (`current`).
 *
 * A hierarquia nao e campo de nenhuma das duas tarefas: nenhuma e revisada, e a
 * de agente tambem pode ser ponta. Toda ponta nova precisa existir e ser do
 * usuario; a conferencia de ciclo e a troca de principal sao feitas na escrita.
 */
export async function planSubtasks(
  taskId: string,
  current: HierarchyOfTask,
  desired: DesiredHierarchy,
  tasks: Pick<TaskRepository, "findByIds">,
  actorUserId: string,
): Promise<SubtaskChange[]> {
  const changes: SubtaskChange[] = [];
  if (desired.parentId !== undefined) {
    const parentId = desired.parentId ?? undefined;
    if (parentId !== current.parentId) {
      if (current.parentId) changes.push({ op: "remove", parentId: current.parentId, subtaskId: taskId });
      if (parentId) changes.push({ op: "add", parentId, subtaskId: taskId });
    }
  }
  if (desired.subtaskIds !== undefined) {
    const wanted = new Set(desired.subtaskIds);
    for (const id of wanted) if (!current.subtaskIds.includes(id)) changes.push({ op: "add", parentId: taskId, subtaskId: id });
    for (const id of current.subtaskIds) if (!wanted.has(id)) changes.push({ op: "remove", parentId: taskId, subtaskId: id });
  }
  if (changes.length === 0) return [];
  if (changes.some((change) => change.parentId === change.subtaskId)) {
    throw new TaskValidationError("A task cannot be its own subtask");
  }

  const added = [...new Set(changes.filter((change) => change.op === "add").flatMap((change) => [change.parentId, change.subtaskId]))]
    .filter((id) => id !== taskId);
  if (added.length > 0) {
    const found = new Map((await tasks.findByIds(added)).map((task) => [task.id, task]));
    for (const id of added) {
      const other = found.get(id);
      if (!other) throw new TaskNotFoundError(`Task not found: ${id}`);
      if (other.userId !== actorUserId) throw new TaskOwnershipError();
    }
  }
  return changes;
}
