import { z } from "zod";
import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import type { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const restoreBody = z.object({ path: configPath, backupId: z.string().min(1).max(200) });

export const restoreAgentFileOperation = {
  method: "POST",
  path: "/api/ai/config/restore",
  status: 201,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/ai/config/restore`: volta um backup para o arquivo (ADR 0005). O
 * texto substituido tambem vira backup, entao a restauracao se desfaz. So o
 * dono acessa. O 201 e o mesmo que o Nest devolvia para este POST.
 */
export function restoreAgentFileRoute(files: Pick<AgentFilesService, "restoreBackup">): ApiRoute {
  return {
    ...restoreAgentFileOperation,
    handler: ({ body, actor }) => {
      assertConfigOwner(actor);
      const { path, backupId } = parseConfigInput(restoreBody, body);
      return configAsNotFound(async () => ({ files: await files.restoreBackup(path, backupId) }));
    },
  };
}
