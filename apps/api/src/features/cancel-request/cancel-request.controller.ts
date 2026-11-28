import { Controller, HttpCode, HttpStatus, Inject, Module, Param, Post, UseGuards } from "@nestjs/common";
import type { RequestDto } from "@repo/contracts";
import { ApiCoreModule } from "../../nest/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { CancelTranscriptionUseCase } from "../request-transcription/cancel-transcription.usecase";
import { RequestTranscriptionModule } from "../request-transcription/request-transcription.controller";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

/**
 * `POST /api/requests/:requestId/cancel`: para o que o agente ainda nao terminou. O que ja foi gravado fica. O pedido
 * de transcricao de video tambem acerta o documento e a Leitura diaria (`CancelTranscriptionUseCase`).
 */
@Controller("api/requests")
@UseGuards(GatewayIdentityGuard)
export class CancelRequestController {
  constructor(
    @Inject(RequestOperations) private readonly requests: RequestOperations,
    @Inject(CancelTranscriptionUseCase) private readonly transcription: CancelTranscriptionUseCase,
  ) {}

  @Post(":requestId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@Param("requestId") requestId: string, @CurrentUser() actor: AuthenticatedUser): Promise<RequestDto> {
    // `view` recusa o pedido de outra pessoa com o mesmo 404 de um id que nao existe.
    const { kind } = await this.requests.view(requestId, actor);
    if (kind === "save_content_with_transcription") await this.transcription.execute(requestId, actor);
    return this.requests.cancel(requestId, actor);
  }
}

@Module({ imports: [ApiCoreModule.forRoot(), RequestTranscriptionModule], controllers: [CancelRequestController] })
export class CancelRequestModule {}
