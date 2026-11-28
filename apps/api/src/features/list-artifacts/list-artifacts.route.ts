import type { ArtifactDto } from "@repo/contracts";
import { parseLimit } from "../../api-core/http-input-validation";
import { normalizeSearch, parseEnum } from "../../api-core/list-filters";
import { BadRequestError } from "../../common/http-errors";
import { ARTIFACT_TYPES, type ArtifactType } from "../../domain";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { ListArtifactsUseCase } from "./list-artifacts.usecase";

export const listArtifactsOperation = {
  method: "GET",
  path: "/api/artifacts",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/artifacts`: os artefatos do usuario; `scope=global` lista os globais do tipo informado. */
export function listArtifactsRoute(listArtifacts: ListArtifactsUseCase): ApiRoute {
  return {
    ...listArtifactsOperation,
    handler: ({ query, actor }): Promise<ArtifactDto[]> => {
      const artifactType = parseEnum<ArtifactType>("type", query.type as string | undefined, ARTIFACT_TYPES);
      const artifactScope = parseEnum<"global">("scope", query.scope as string | undefined, ["global"]);
      if (artifactScope === "global" && !artifactType) {
        throw new BadRequestError("The global scope requires a type");
      }
      return listArtifacts.execute(
        {
          type: artifactType,
          scope: artifactScope,
          tag: (query.tag as string | undefined)?.trim().toLowerCase() || undefined,
          q: normalizeSearch(query.q as string | undefined),
          taskId: (query.taskId as string | undefined) || undefined,
          limit: parseLimit(query.limit as string | undefined),
        },
        actor,
      );
    },
  };
}
