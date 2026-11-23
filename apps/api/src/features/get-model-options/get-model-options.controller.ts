import { Controller, Get, Module, NotFoundException, UseGuards } from "@nestjs/common";
import type { ModelOptionsDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { modelOptions } from "../../api-core/requests/model-catalog";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";

/**
 * `GET /api/requests/model/options`: os provedores com chave neste ambiente, os modelos de cada um e a escolha padrao
 * do modo modelo (ADR 0019). Os do OpenRouter vem da API dele. Sem nenhuma chave, 404: o modo nao existe aqui.
 */
@Controller("api/requests")
export class GetModelOptionsController {
  @Get("model/options")
  @UseGuards(GatewayIdentityGuard)
  async options(): Promise<ModelOptionsDto> {
    const options = await modelOptions();
    if (!options) throw new NotFoundException();
    return options;
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [GetModelOptionsController] })
export class GetModelOptionsModule {}
