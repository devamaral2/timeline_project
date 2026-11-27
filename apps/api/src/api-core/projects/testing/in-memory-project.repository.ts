import { ProjectNameTakenError, type ProjectRef } from "../../../domain";
import type { ProjectRepository } from "../../../domain/ports";
import { personalProjectOf } from "./in-memory-project.query";

/**
 * `ProjectRepository` sem banco: os projetos de cada usuario numa lista, com o `diario` ja ali (nos testes sem banco
 * ele nasce junto da primeira leitura). O nome repetido e conferido como o banco faz, sem distinguir maiusculas.
 */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly created: (ProjectRef & { userId: string })[] = [];
  private sequence = 0;

  async create(userId: string, name: string): Promise<ProjectRef> {
    const taken = [personalProjectOf(userId), ...this.of(userId)].some(
      (project) => project.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new ProjectNameTakenError(`Project already exists: ${name}`);
    this.sequence += 1;
    const project = { id: `project-${this.sequence}`, name, personal: false };
    this.created.push({ ...project, userId });
    return project;
  }

  /** Os projetos criados por `create` para o usuario, na ordem em que nasceram. */
  of(userId: string): ProjectRef[] {
    return this.created.filter((project) => project.userId === userId).map(({ id, name, personal }) => ({ id, name, personal }));
  }
}
