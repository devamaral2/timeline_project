import type { Clock } from "../../../common/clock";
import type { DeviceKeyRepository } from "../../../auth-core/persistence/postgres-device-key.repository";
import { hashSecretToken } from "../../../auth-core/security/secret-token";
import { looksLikeDeviceKey, type DeviceKeyIdentity } from "../../../domain/device-keys/device-key";

/** Resolve o token apresentado para a identidade da chave, ou `null` (desconhecida, revogada ou dono inativo). */
export class AuthenticateDeviceKeyUseCase {
  constructor(
    private readonly keys: Pick<DeviceKeyRepository, "authenticate">,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<DeviceKeyIdentity | null> {
    if (!looksLikeDeviceKey(token)) return null;
    return this.keys.authenticate({ keyHash: hashSecretToken(token), now: this.clock.now() });
  }
}
