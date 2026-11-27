import type { ProjectRef } from "../types/project";

/** A escrita de projetos. A leitura fica em `ProjectQuery`. */
export interface ProjectRepository {
  /**
   * Cria o projeto de um usuario, com o nome ja normalizado. `ProjectNameTakenError` quando o usuario ja tem um com
   * esse nome, sem distinguir maiusculas de minusculas (o `personal` conta, mesmo antes de existir a linha dele).
   */
  create(userId: string, name: string): Promise<ProjectRef>;
}
