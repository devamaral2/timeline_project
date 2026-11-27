import type { ProjectDto } from "@repo/contracts";
import { normalizeProjectName } from "../../domain";
import type { ProjectRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

export class CreateProjectUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  /** Cria um projeto do usuario pelo nome (sem os espacos das pontas, de 1 a 60 caracteres, unico sem distinguir maiusculas). */
  async execute(input: { name: unknown }, actor: AuthenticatedUser): Promise<ProjectDto> {
    const name = normalizeProjectName(input.name);
    const { id, personal } = await this.projects.create(actor.userId, name);
    return { id, name, personal };
  }
}
