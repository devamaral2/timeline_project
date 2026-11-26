import { insertAuditEvents } from "../../audit/postgres-audit-log";
import type { RequestContext } from "../../common/request-context";
import type { AuthDatabase } from "../../db/client";
import type { DeviceKeyIdentity, DevicePermission } from "../../domain/device-keys/device-key";

export interface IssueDeviceKeyCommand {
  id: string;
  userId: string;
  label: string;
  keyHash: string;
  permission: DevicePermission;
  now: Date;
  context: RequestContext;
}
export interface RevokeDeviceKeyCommand { id: string; now: Date; context: RequestContext }
export type RevokeDeviceKeyResult = "revoked" | "already_revoked" | "not_found";

/** A chave em si nunca entra no banco nem na auditoria: so o hash dela. */
export class PostgresDeviceKeyRepository {
  constructor(private readonly db: AuthDatabase) {}

  async issue(command: IssueDeviceKeyCommand): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO device_keys(id, user_id, label, permission, key_hash, created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [command.id, command.userId, command.label, command.permission, command.keyHash, command.now],
      );
      await insertAuditEvents(tx, [{
        correlationId: command.context.correlationId, actorUserId: null, action: "device_key.issued",
        targetType: "device_key", targetId: command.id, result: "succeeded", reason: null,
        metadata: { userId: command.userId, permission: command.permission }, context: command.context, occurredAt: command.now,
      }]);
    });
  }

  async revoke(command: RevokeDeviceKeyCommand): Promise<RevokeDeviceKeyResult> {
    return this.db.transaction(async (tx) => {
      const revoked = await tx.query("UPDATE device_keys SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL RETURNING user_id", [command.id, command.now]);
      if (revoked.rowCount) {
        await insertAuditEvents(tx, [{
          correlationId: command.context.correlationId, actorUserId: null, action: "device_key.revoked",
          targetType: "device_key", targetId: command.id, result: "succeeded", reason: null,
          metadata: { userId: String(revoked.rows[0].user_id) }, context: command.context, occurredAt: command.now,
        }]);
        return "revoked" as const;
      }
      const existing = await tx.query("SELECT 1 FROM device_keys WHERE id=$1", [command.id]);
      return existing.rowCount ? ("already_revoked" as const) : ("not_found" as const);
    });
  }

  /** Valida a chave a cada pedido: revogar ou desativar o dono vale na hora. */
  async authenticate(input: { keyHash: string; now: Date }): Promise<DeviceKeyIdentity | null> {
    const result = await this.db.query<{ id: string; user_id: string; permission: DevicePermission }>(
      `UPDATE device_keys dk SET last_used_at=$2
         FROM users u
        WHERE dk.key_hash=$1 AND dk.revoked_at IS NULL AND u.id=dk.user_id AND u.status='active'
        RETURNING dk.id, dk.user_id, dk.permission`,
      [input.keyHash, input.now],
    );
    const row = result.rows[0];
    return row ? { keyId: row.id, userId: row.user_id, permission: row.permission } : null;
  }
}

export type DeviceKeyRepository = Pick<PostgresDeviceKeyRepository, "issue" | "revoke" | "authenticate">;
