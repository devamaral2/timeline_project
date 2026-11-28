import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import type { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const listAgentFileBackupsOperation = {
  method: "GET",
  path: "/api/ai/config/backups",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/ai/config/backups`: cada mudanca guarda o texto anterior (ADR 0005). So o dono acessa. */
export function listAgentFileBackupsRoute(files: Pick<AgentFilesService, "listBackups">): ApiRoute {
  return {
    ...listAgentFileBackupsOperation,
    handler: ({ query, actor }) => {
      assertConfigOwner(actor);
      const safe = parseConfigInput(configPath, query.path);
      return configAsNotFound(async () => ({ backups: await files.listBackups(safe) }));
    },
  };
}
