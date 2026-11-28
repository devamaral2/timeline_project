import { assertConfigOwner } from "../../api-core/agent/config/agent-config-access";
import type { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const listAgentFilesOperation = {
  method: "GET",
  path: "/api/ai/config",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/ai/config`: as skills e os agentes como arquivos (ADR 0005). So o dono acessa. */
export function listAgentFilesRoute(files: Pick<AgentFilesService, "entries">): ApiRoute {
  return {
    ...listAgentFilesOperation,
    handler: ({ actor }) => {
      assertConfigOwner(actor);
      return { files: files.entries() };
    },
  };
}
