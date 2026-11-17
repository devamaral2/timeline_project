import type { TaskRequestLink, TaskRequestLinkQuery } from "../../../domain/ports";

/** Os pedidos de cada tarefa, informados pelo teste, com a ordem de `PostgresTaskRequestLinkQuery` (do mais antigo ao mais novo). */
export class InMemoryTaskRequestLinkQuery implements TaskRequestLinkQuery {
  private readonly byTask = new Map<string, TaskRequestLink[]>();

  link(taskId: string, link: TaskRequestLink): this {
    this.byTask.set(taskId, [...(this.byTask.get(taskId) ?? []), link]);
    return this;
  }

  async linksOf(taskId: string): Promise<TaskRequestLink[]> {
    return [...(this.byTask.get(taskId) ?? [])].sort((left, right) => left.at.getTime() - right.at.getTime());
  }
}
