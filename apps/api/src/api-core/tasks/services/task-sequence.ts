import { TaskNotFoundError, TaskOwnershipError, TaskValidationError } from "../../../domain/index";
import type { TaskRepository, SequenceChange } from "../../../domain/ports";

/** A ordem de uma tarefa hoje: de quais ela se segue e quais se seguem a ela. */
export interface SequenceOfTask {
  previousIds: readonly string[];
  nextIds: readonly string[];
}

/**
 * As arestas a gravar para que `taskId` se siga exatamente de
 * `desired.previousIds` e tenha como sequencia exatamente `desired.nextIds`,
 * dado onde ele esta hoje (`current`). Lista ausente nao muda aquele lado.
 *
 * A sequencia nao e campo de nenhuma das duas tarefas: nenhuma e revisada, e o
 * de agente tambem pode ser ponta. Toda ponta nova precisa existir e ser do
 * usuario; a conferencia de ciclo e feita na escrita.
 */
export async function planSequence(
  taskId: string,
  current: SequenceOfTask,
  desired: Partial<SequenceOfTask>,
  tasks: Pick<TaskRepository, "findByIds">,
  actorUserId: string,
): Promise<SequenceChange[]> {
  const changes: SequenceChange[] = [];
  const diff = (before: readonly string[], after: readonly string[] | undefined, edge: (otherId: string) => Pick<SequenceChange, "fromId" | "toId">) => {
    if (after === undefined) return;
    const wanted = new Set(after);
    for (const id of wanted) if (!before.includes(id)) changes.push({ op: "add", ...edge(id) });
    for (const id of before) if (!wanted.has(id)) changes.push({ op: "remove", ...edge(id) });
  };
  diff(current.previousIds, desired.previousIds, (id) => ({ fromId: id, toId: taskId }));
  diff(current.nextIds, desired.nextIds, (id) => ({ fromId: taskId, toId: id }));
  if (changes.length === 0) return [];
  if (changes.some((change) => change.fromId === change.toId)) {
    throw new TaskValidationError("A task cannot follow itself");
  }

  const added = [...new Set(changes.filter((change) => change.op === "add").flatMap((change) => [change.fromId, change.toId]))]
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
