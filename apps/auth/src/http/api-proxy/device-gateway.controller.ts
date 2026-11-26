import { All, Body, Controller, Inject, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { DeviceKeyAuthGuard, type DeviceKeyRequest } from "../../auth-core/security/device-key-auth.guard";
import type { RuntimeEnv } from "../../config/env";
import { RUNTIME_ENV } from "../../config/tokens";
import { DEVICE_PERMISSIONS_HEADER, DEVICE_ROUTE_PREFIX } from "../../domain/device-keys/device-key";
import { forwardToApi } from "./api-gateway.forward";

/**
 * A unica porta da chave de dispositivo. Encaminha para a API a identidade do
 * dono e a permissao da chave (nunca uma sessao). Precisa vir antes do
 * `ApiGatewayController` no modulo: o dele capturaria o prefixo `api/*`.
 */
@Controller(DEVICE_ROUTE_PREFIX)
export class DeviceGatewayController {
  constructor(@Inject(RUNTIME_ENV) private readonly env: RuntimeEnv) {}

  @All("*path")
  @UseGuards(DeviceKeyAuthGuard)
  async forward(@Req() request: DeviceKeyRequest, @Res() response: Response, @Body() body: unknown): Promise<void> {
    const key = request.deviceKey;
    if (!key) throw new Error("device key guard did not run");
    await forwardToApi(this.env, request, response, body, {
      "x-auth-user-id": key.userId,
      [DEVICE_PERMISSIONS_HEADER]: key.permission,
      "x-auth-device-key-id": key.keyId,
    });
  }
}
