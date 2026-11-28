import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { DeleteArtifactUseCase } from "./delete-artifact.usecase";

export const deleteArtifactOperation = {
  method: "DELETE",
  path: "/api/artifacts/:artifactId",
  status: 204,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `DELETE /api/artifacts/:artifactId`: apaga o artefato do dono; skill e roteador seguem os arquivos. */
export function deleteArtifactRoute(deleteArtifact: DeleteArtifactUseCase): ApiRoute {
  return {
    ...deleteArtifactOperation,
    handler: async ({ params, actor }) => {
      await deleteArtifact.execute({ artifactId: params.artifactId as string }, actor);
    },
  };
}
