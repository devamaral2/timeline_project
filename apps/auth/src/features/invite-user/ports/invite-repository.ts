import type { AuditEventInput } from "../../../audit/audit-event";
import type { DirectPermission } from "../../../domain/rbac/effective-permissions";
import type { BootstrapAdminCommand, BootstrapAdminCommitOutcome, InviteInspection } from "../../../domain/invites/invite";

export interface NewInviteWrite { id: string; tokenHash: string; expiresAt: Date }

export interface CreateInviteCommand {
  userId: string;
  email: string;
  name: string;
  roleKeys: readonly string[];
  directPermissions: readonly DirectPermission[];
  invite: NewInviteWrite;
  issuerUserId: string;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}
export type CreateInviteOutcome = { kind: "created"; userId: string } | { kind: "email_already_exists" };

export interface AcceptInviteCommand {inviteId:string;userId:string;passwordHash:string;now:Date;auditEvents:readonly AuditEventInput[]}

export interface InviteRepository {
  acceptInvite(command:AcceptInviteCommand):Promise<"accepted"|"invalid">;
  inspectByTokenHash(hash: string, now: Date): Promise<InviteInspection | null>;
  bootstrapAdmin(command: BootstrapAdminCommand): Promise<BootstrapAdminCommitOutcome>;
  /** Usuario `pending_invite`, RBAC, convite e auditoria em uma unica transacao. */
  createPendingUserWithAccessAndInvite(command: CreateInviteCommand): Promise<CreateInviteOutcome>;
}
