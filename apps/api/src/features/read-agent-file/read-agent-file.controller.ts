import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";


/** Skills e agentes como arquivos (ADR 0005). So o dono acessa. */
@Controller("api/ai/config")
export class ReadAgentFileController {
  constructor(@Inject(AgentFilesService) private readonly files: AgentFilesService) {}

  @Get("file")
  @UseGuards(GatewayIdentityGuard)
  execute(@Query("path") path: string, @CurrentUser() actor: AuthenticatedUser) {
    assertConfigOwner(actor);
    const safe = parseConfigInput(configPath, path);
    return configAsNotFound(() => this.files.read(safe));
  }
}
