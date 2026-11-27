import type { ProjectDto } from "@repo/contracts";
import type { ProjectQuery } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

export class ListProjectsUseCase {
  constructor(private readonly projects: Pick<ProjectQuery, "list">) {}

  /** Os projetos do usuario: `personal` primeiro e os outros por nome. */
  async execute(actor: AuthenticatedUser): Promise<ProjectDto[]> {
    return (await this.projects.list(actor.userId)).map(({ id, name, personal }) => ({ id, name, personal }));
  }
}
