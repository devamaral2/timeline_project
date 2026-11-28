import type { CreateProjectInput, ProjectDto } from "@repo/contracts";
import { assertProjectFields } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { CreateProjectUseCase } from "./create-project.usecase";

export const createProjectOperation = {
  method: "POST",
  path: "/api/projects",
  status: 201,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `POST /api/projects`: cria um projeto do usuario pelo nome. */
export function createProjectRoute(createProject: CreateProjectUseCase): ApiRoute {
  return {
    ...createProjectOperation,
    handler: ({ body, actor }): Promise<ProjectDto> => {
      assertProjectFields(body as Record<string, unknown>);
      return createProject.execute(body as CreateProjectInput, actor);
    },
  };
}
