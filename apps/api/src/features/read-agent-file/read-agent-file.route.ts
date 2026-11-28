import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import type { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const readAgentFileOperation = {
  method: "GET",
  path: "/api/ai/config/file",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/ai/config/file`: o texto de uma skill ou agente (ADR 0005). So o dono acessa. */
export function readAgentFileRoute(files: Pick<AgentFilesService, "read">): ApiRoute {
  return {
    ...readAgentFileOperation,
    handler: ({ query, actor }) => {
      assertConfigOwner(actor);
      const safe = parseConfigInput(configPath, query.path);
      return configAsNotFound(() => files.read(safe));
    },
  };
}
