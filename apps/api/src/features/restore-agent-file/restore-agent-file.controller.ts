import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";

export const restoreBody = z.object({ path: configPath, backupId: z.string().min(1).max(200) });

/** Skills e agentes como arquivos (ADR 0005). So o dono acessa. */
@Controller("api/ai/config")
export class RestoreAgentFileController {
  constructor(@Inject(AgentFilesService) private readonly files: AgentFilesService) {}

  @Post("restore")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    assertConfigOwner(actor);
    const { path, backupId } = parseConfigInput(restoreBody, body);
    return configAsNotFound(async () => ({ files: await this.files.restoreBackup(path, backupId) }));
  }
}
