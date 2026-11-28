import {
  CanActivate,
  ForbiddenException,
  Injectable,
  type ExecutionContext,
} from "@nestjs/common";
import { DEVICE_PERMISSIONS_HEADER, TRANSCRIPTION_WORK_PERMISSION } from "@repo/contracts/device-key";
import { assertFromGateway, type GatewayRequest } from "./gateway-identity.guard";

/**
 * Guarda das rotas do servico local de transcricao: exige a identidade do
 * gateway COM a permissao de trabalhar em transcricoes. Uma sessao comum nao a
 * tem, entao e recusada aqui mesmo que o gateway a encaminhe.
 */
@Injectable()
export class TranscriptionWorkerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const userId = assertFromGateway(request);
    const permissionsHeader = request.header(DEVICE_PERMISSIONS_HEADER);
    const permissions = (typeof permissionsHeader === "string" ? permissionsHeader : "")
      .split(",")
      .map((value) => value.trim());
    if (!permissions.includes(TRANSCRIPTION_WORK_PERMISSION)) throw new ForbiddenException();

    request.actor = { userId, permissions: [TRANSCRIPTION_WORK_PERMISSION] };
    return true;
  }
}
