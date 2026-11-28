import type { ArtifactDto } from "@repo/contracts";
import { HttpError } from "../../common/http-errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { GetArtifactUseCase } from "./get-artifact.usecase";

export const getArtifactOperation = {
  method: "GET",
  path: "/api/artifacts/:artifactId",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/artifacts/:artifactId`: um artefato global e de todos; os demais, so do dono. */
export function getArtifactRoute(getArtifact: GetArtifactUseCase): ApiRoute {
  return {
    ...getArtifactOperation,
    handler: async ({ params, actor }): Promise<ArtifactDto> => {
      const artifact = await getArtifact.execute({ artifactId: params.artifactId as string }, actor);
      if (!artifact) throw new HttpError(404, "Artifact not found");
      return artifact;
    },
  };
}
