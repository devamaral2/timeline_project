import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { DeviceKeyIdentity } from "../domain/device-keys/device-key";
import { authenticateDeviceKey } from "../auth-core/security/device-key-authentication";
import { AuthenticateDeviceKeyUseCase } from "../features/device-keys/usecases/authenticate-device-key.usecase";

export type DeviceKeyRequest = Request & { deviceKey?: DeviceKeyIdentity };

/**
 * Adaptador temporario do Nest para a autenticacao de chave de dispositivo. A
 * regra vive em `auth-core/security/device-key-authentication.ts`.
 * `@Inject` explicito pelo mesmo motivo do `BearerAuthGuard`.
 */
@Injectable()
export class DeviceKeyAuthGuard implements CanActivate {
  constructor(@Inject(AuthenticateDeviceKeyUseCase) private readonly authenticate: AuthenticateDeviceKeyUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceKeyRequest>();
    request.deviceKey = await authenticateDeviceKey(request, this.authenticate);
    return true;
  }
}
