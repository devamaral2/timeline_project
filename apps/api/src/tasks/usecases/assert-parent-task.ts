import { TaskHierarchyError, TaskNotFoundError, TaskOwnershipError } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";

/**
 * Valida o pai escolhido para uma subtarefa: precisa existir, ser do mesmo dono
 * e nao estar abaixo da propria tarefa na arvore.
 *
 * Sobe a cadeia de pais a partir do candidato ate a raiz. Ciclo so nasce aqui —
 * na criacao o id ainda nao esta em arvore nenhuma, e a auto-referencia direta
 * ja morre no `Task` e no check do banco —, entao esta e a unica travessia
 * necessaria. O contador de passos existe porque uma arvore ja corrompida
 * (escrita fora daqui) faria o laco rodar para sempre.
 */
export async function assertParentTaskAssignable(
  taskRepository: Pick<TaskRepository, "findById">,
  parentTaskId: string,
  actorUserId: string,
  taskId?: string,
): Promise<void> {
  let currentId: string | undefined = parentTaskId;
  let steps = 0;

  while (currentId) {
    if (currentId === taskId) {
      throw new TaskHierarchyError("A task cannot become a subtask of its own subtree");
    }

    const current = await taskRepository.findById(currentId);
    if (!current) throw new TaskNotFoundError(`Task not found: ${currentId}`);
    if (current.userId !== actorUserId) throw new TaskOwnershipError();

    if (++steps > MAX_ANCESTOR_WALK) {
      throw new TaskHierarchyError("Task hierarchy is too deep to validate");
    }
    currentId = current.parentTaskId;
  }
}

const MAX_ANCESTOR_WALK = 100;
