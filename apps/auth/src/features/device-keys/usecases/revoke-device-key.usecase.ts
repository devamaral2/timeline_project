import type { Clock } from "../../../common/clock";
import type { RequestContext } from "../../../common/request-context";
import type { DeviceKeyRepository, RevokeDeviceKeyResult } from "../../../auth-core/persistence/postgres-device-key.repository";

export class RevokeDeviceKeyUseCase {
  constructor(
    private readonly keys: Pick<DeviceKeyRepository, "revoke">,
    private readonly clock: Clock,
  ) {}

  execute(input: { keyId: string; context: RequestContext }): Promise<RevokeDeviceKeyResult> {
    return this.keys.revoke({ id: input.keyId, now: this.clock.now(), context: input.context });
  }
}
