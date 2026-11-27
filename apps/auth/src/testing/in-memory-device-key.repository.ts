import type { DeviceKeyRepository, IssueDeviceKeyCommand, RevokeDeviceKeyCommand, RevokeDeviceKeyResult } from "../auth-core/persistence/postgres-device-key.repository";
import type { DeviceKeyIdentity } from "../domain/device-keys/device-key";

interface StoredKey extends IssueDeviceKeyCommand { revokedAt: Date | null }

/** Dublê em memoria da porta de chaves de dispositivo, para testes de usecase e de gateway. */
export class InMemoryDeviceKeyRepository implements DeviceKeyRepository {
  readonly keys = new Map<string, StoredKey>();

  async issue(command: IssueDeviceKeyCommand): Promise<void> {
    this.keys.set(command.id, { ...command, revokedAt: null });
  }

  async revoke(command: RevokeDeviceKeyCommand): Promise<RevokeDeviceKeyResult> {
    const key = this.keys.get(command.id);
    if (!key) return "not_found";
    if (key.revokedAt) return "already_revoked";
    key.revokedAt = command.now;
    return "revoked";
  }

  async authenticate(input: { keyHash: string; now: Date }): Promise<DeviceKeyIdentity | null> {
    for (const [id, key] of this.keys) {
      if (key.keyHash === input.keyHash && !key.revokedAt) {
        return { keyId: id, userId: key.userId, permission: key.permission };
      }
    }
    return null;
  }
}
