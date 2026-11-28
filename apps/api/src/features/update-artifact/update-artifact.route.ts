import type { UpdateArtifactRequest } from "@repo/contracts";
import { assertArtifactRequest, assertExpectedRevision } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { UpdateArtifactUseCase } from "./update-artifact.usecase";

export const updateArtifactOperation = {
  method: "PATCH",
  path: "/api/artifacts/:artifactId",
  status: 204,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `PATCH /api/artifacts/:artifactId`: conteudo e tarefas em que aparece mudam numa transacao so. */
export function updateArtifactRoute(updateArtifact: UpdateArtifactUseCase): ApiRoute {
  return {
    ...updateArtifactOperation,
    handler: async ({ params, body, actor }) => {
      assertArtifactRequest(body as Record<string, unknown>, false);
      assertExpectedRevision(body as { expectedRevision?: unknown });
      await updateArtifact.execute(
        { ...(body as Omit<UpdateArtifactRequest, "artifactId">), artifactId: params.artifactId as string } as UpdateArtifactRequest,
        actor,
      );
    },
  };
}
