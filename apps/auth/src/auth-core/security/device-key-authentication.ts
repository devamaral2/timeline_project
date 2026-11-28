import { AuthenticationFailedError } from "../../common/errors";
import type { DeviceKeyIdentity } from "../../domain/device-keys/device-key";
import type { HeaderCarrier } from "./access-token-authentication";

export interface DeviceKeyAuthenticator {
  execute(key: string): Promise<DeviceKeyIdentity | null>;
}

/**
 * Autentica `Authorization: Bearer bdk_...`. A chave de dispositivo é aceita
 * apenas nas rotas do serviço local; o bearer de sessão não passa por aqui.
 */
export async function authenticateDeviceKey(
  request: HeaderCarrier,
  authenticator: DeviceKeyAuthenticator,
): Promise<DeviceKeyIdentity> {
  const value = request.header("authorization");
  if (!value || !/^Bearer [^\s]+$/.test(value)) throw new AuthenticationFailedError("missing device key");
  const identity = await authenticator.execute(value.slice(7));
  if (!identity) throw new AuthenticationFailedError("unknown, revoked or inactive device key");
  return identity;
}
