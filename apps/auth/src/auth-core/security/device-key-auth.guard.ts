import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AuthenticationFailedError } from "../../common/errors";
import type { DeviceKeyIdentity } from "../../domain/device-keys/device-key";
import { AuthenticateDeviceKeyUseCase } from "../../features/device-keys/usecases/authenticate-device-key.usecase";

export type DeviceKeyRequest = Request & { deviceKey?: DeviceKeyIdentity };

/**
 * Autentica uma chave de dispositivo (`Authorization: Bearer bdk_...`). So as
 * rotas do servico local usam esta guarda; o `BearerAuthGuard` das demais
 * rotas nao conhece o formato e recusa a chave.
 * `@Inject` explicito pelo mesmo motivo do `BearerAuthGuard`.
 */
@Injectable()
export class DeviceKeyAuthGuard implements CanActivate {
  constructor(@Inject(AuthenticateDeviceKeyUseCase) private readonly authenticate: AuthenticateDeviceKeyUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceKeyRequest>();
    const value = request.header("authorization");
    if (!value || !/^Bearer [^\s]+$/.test(value)) throw new AuthenticationFailedError("missing device key");
    const identity = await this.authenticate.execute(value.slice(7));
    if (!identity) throw new AuthenticationFailedError("unknown, revoked or inactive device key");
    request.deviceKey = identity;
    return true;
  }
}
