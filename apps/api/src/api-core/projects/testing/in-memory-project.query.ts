import type { ProjectRef } from "../../../domain";
import type { ProjectQuery } from "../../../domain/ports";
import type { InMemoryTaskDatabase } from "../../tasks/testing/in-memory-task-database";

/** O `personal` de um usuario nos testes sem banco: nasce junto da primeira leitura, com um id que so depende do usuario. */
export function personalProjectOf(userId: string): ProjectRef {
  return { id: `personal-${userId}`, name: "personal", personal: true };
}

/**
 * `ProjectQuery` sobre o banco de tarefas em memoria. Os testes sem banco so conhecem o `personal`: e nele que toda
 * tarefa cai enquanto nada escolhe o projeto.
 */
export class InMemoryProjectQuery implements ProjectQuery {
  constructor(private readonly database?: Pick<InMemoryTaskDatabase, "tasks">) {}

  async list(userId: string): Promise<ProjectRef[]> {
    return [personalProjectOf(userId)];
  }

  async ofTasks(taskIds: readonly string[]): Promise<Map<string, ProjectRef>> {
    const found = new Map<string, ProjectRef>();
    for (const task of this.database?.tasks ?? []) {
      if (taskIds.includes(task.id)) found.set(task.id, personalProjectOf(task.userId));
    }
    return found;
  }
}
