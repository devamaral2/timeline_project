import type { ProjectDto } from "@repo/contracts";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { ListProjectsUseCase } from "./list-projects.usecase";

export const listProjectsOperation = {
  method: "GET",
  path: "/api/projects",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/projects`: os projetos do usuario, `diario` primeiro. */
export function listProjectsRoute(listProjects: ListProjectsUseCase): ApiRoute {
  return {
    ...listProjectsOperation,
    handler: ({ actor }): Promise<ProjectDto[]> => listProjects.execute(actor),
  };
}
