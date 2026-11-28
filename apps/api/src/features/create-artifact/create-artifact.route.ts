import type { CreateArtifactRequest } from "@repo/contracts";
import { assertArtifactRequest } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { CreateArtifactUseCase } from "./create-artifact.usecase";

export const createArtifactOperation = {
  method: "POST",
  path: "/api/artifacts",
  status: 201,
  authentication: "gateway-session",
  idempotent: true,
} as const satisfies ApiRouteOperation;

/** `POST /api/artifacts`: o artefato e as tarefas em que ele ja nasce aparecendo entram juntos. */
export function createArtifactRoute(createArtifact: CreateArtifactUseCase): ApiRoute {
  return {
    ...createArtifactOperation,
    handler: ({ body, actor }) => {
      assertArtifactRequest(body as Record<string, unknown>, true);
      return createArtifact.execute(body as CreateArtifactRequest, actor);
    },
  };
}
