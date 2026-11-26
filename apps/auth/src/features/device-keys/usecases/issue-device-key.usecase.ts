import type { Clock } from "../../../common/clock";
import type { RequestContext } from "../../../common/request-context";
import type { SecretGenerator } from "../../../common/secret-generator";
import type { DeviceKeyRepository } from "../../../auth-core/persistence/postgres-device-key.repository";
import type { UserReader } from "../../../auth-core/persistence/postgres-user.repository";
import { hashSecretToken } from "../../../auth-core/security/secret-token";
import { DEVICE_KEY_PREFIX, TRANSCRIPTION_WORK_PERMISSION } from "@repo/contracts/device-key";
import { canSignIn, normalizeEmail } from "../../../domain/users/user";

/** Emite uma chave para um usuario ativo. A chave em claro so existe neste retorno. */
export class IssueDeviceKeyUseCase {
  constructor(
    private readonly users: Pick<UserReader, "findByEmail">,
    private readonly keys: Pick<DeviceKeyRepository, "issue">,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
  ) {}

  async execute(input: { email: string; label: string; context: RequestContext }): Promise<{ keyId: string; userId: string; key: string }> {
    const user = await this.users.findByEmail(normalizeEmail(input.email));
    if (!user || !canSignIn(user)) throw new Error("active user not found");

    const key = `${DEVICE_KEY_PREFIX}${this.secrets.randomBytes(32).toString("base64url")}`;
    const keyId = this.secrets.randomId();
    await this.keys.issue({
      id: keyId, userId: user.id, label: input.label, keyHash: hashSecretToken(key),
      permission: TRANSCRIPTION_WORK_PERMISSION, now: this.clock.now(), context: input.context,
    });
    return { keyId, userId: user.id, key };
  }
}
