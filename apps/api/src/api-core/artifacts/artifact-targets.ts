import { TaskNotFoundError, TaskOwnershipError, type Task, type TaskArtifactRelationKind } from "../../domain";
import type { TaskRepository, StagedChange } from "../../domain/ports";

/**
 * As mudancas nas tarefas que fazem o artefato aparecer exatamente em
 * `desiredTaskIds`, dado onde ele aparece hoje (`currentTaskIds`). Quem entra
 * o recebe no fim da lista, com a relacao `relation`; quem sai perde a relacao.
 *
 * Quem registra o artefato e a tarefa: entrar ou sair da lista de uma tarefa e
 * edita-lo. Toda tarefa tocada precisa existir e ser do usuario, e uma
 * ocorrencia de serie que ganha ou perde um artefato por aqui passa a ser so dela.
 */
export async function planArtifactLinks(
  artifactId: string,
  currentTaskIds: readonly string[],
  desiredTaskIds: readonly string[],
  tasks: Pick<TaskRepository, "findByIds">,
  actorUserId: string,
  relation: TaskArtifactRelationKind = "uses",
): Promise<StagedChange<Task>[]> {
  const added = desiredTaskIds.filter((id) => !currentTaskIds.includes(id));
  const removed = currentTaskIds.filter((id) => !desiredTaskIds.includes(id));
  const touched = [...added, ...removed];
  if (touched.length === 0) return [];

  const byId = new Map((await tasks.findByIds(touched)).map((task) => [task.id, task]));
  return touched.map((id) => {
    const task = byId.get(id);
    if (!task) throw new TaskNotFoundError(`Task not found: ${id}`);
    if (task.userId !== actorUserId) throw new TaskOwnershipError();

    const artifactLinks = added.includes(id)
      ? [...task.artifactLinks, { artifactId, relation, fromRecurrence: false }]
      : task.artifactLinks.filter((link) => link.artifactId !== artifactId);
    return { op: "update", entity: task.revise({ artifactLinks }), expectedRevision: task.revision };
  });
}

export function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}
