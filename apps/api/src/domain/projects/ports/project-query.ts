import type { ProjectRef } from "../types/project";

/** As leituras de projeto: o catalogo do usuario e o projeto de cada tarefa. */
export interface ProjectQuery {
  /**
   * Os projetos do usuario, `personal` primeiro e os outros por nome. O `personal` nasce nesta leitura quando o
   * usuario ainda nao tem nenhum projeto: e a primeira necessidade dele.
   */
  list(userId: string): Promise<ProjectRef[]>;
  /** O projeto de cada tarefa entre os ids, por id da tarefa. Tarefa que nao existe fica de fora. */
  ofTasks(taskIds: readonly string[]): Promise<Map<string, ProjectRef>>;
}
