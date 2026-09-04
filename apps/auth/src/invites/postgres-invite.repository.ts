import { acquireAdvisoryLock, ADVISORY_LOCK } from "../db/transaction-locks";
import { randomUUID } from "node:crypto";
import type { AuthDatabase, AuthTransaction } from "../db/client";
import type { CreateInviteCommand, CreateInviteOutcome, InviteRepository, ReissueInviteCommand, ReissueInviteOutcome, RevokeInviteCommand, RevokeInviteOutcome } from "./ports/invite-repository";
import type { BootstrapAdminCommand, BootstrapAdminCommitOutcome, InviteInspection } from "./invite";
import { insertAuditEvents } from "../audit/postgres-audit-log";

/** Um convite reemitido ou revogado leva junto tudo que dependia do link
 *  anterior: o convite em si e qualquer aceite em andamento. */
async function invalidateOpenInvites(tx: AuthTransaction, userId: string, now: Date): Promise<void> {
  await tx.query("UPDATE invites SET revoked_at=$1 WHERE user_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL", [now, userId]);
  await tx.query("UPDATE mfa_challenges SET invalidated_at=$1 WHERE consumed_at IS NULL AND invalidated_at IS NULL AND attempt_id IN (SELECT id FROM authentication_attempts WHERE user_id=$2 AND purpose='invite_acceptance' AND consumed_at IS NULL AND invalidated_at IS NULL)", [now, userId]);
  await tx.query("UPDATE authentication_attempts SET invalidated_at=$1 WHERE user_id=$2 AND purpose='invite_acceptance' AND consumed_at IS NULL AND invalidated_at IS NULL", [now, userId]);
}
export class PostgresInviteRepository implements InviteRepository {
  constructor(private readonly db: AuthDatabase) {}
  async inspectByTokenHash(hash:string, now:Date):Promise<InviteInspection|null> { const r=await this.db.query("SELECT i.id invite_id,i.user_id,u.name,u.email,i.expires_at FROM invites i JOIN users u ON u.id=i.user_id WHERE i.token_hash=$1 AND i.expires_at>$2 AND i.accepted_at IS NULL AND i.revoked_at IS NULL",[hash,now]); const x=r.rows[0]; return x ? {inviteId:x.invite_id,userId:x.user_id,name:x.name,email:x.email,expiresAt:x.expires_at}:null; }
  async bootstrapAdmin(command:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome> { return this.db.transaction(async tx => this.commit(tx,command)); }
  private async commit(tx:AuthTransaction,c:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome> { await acquireAdvisoryLock(tx,ADVISORY_LOCK.bootstrapAdmin); const admins=await tx.query("SELECT u.id,u.email,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_key='admin' FOR UPDATE"); if (admins.rowCount===0) { await tx.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,$3,'pending_invite',$4,$4)",[c.userId,c.email,c.name,c.now]); await tx.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,'admin')",[c.userId]); await this.insertInvite(tx,c); await this.audit(tx,c); return {kind:"created",userId:c.userId}; }
    const admin=admins.rows[0]; if (admins.rowCount===1 && admin.email===c.email && admin.status==='pending_invite') { await tx.query("UPDATE invites SET revoked_at=$1 WHERE user_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL",[c.now,admin.id]); await this.insertInvite(tx,{...c,userId:admin.id}); await this.audit(tx,c); return {kind:"reissued",userId:admin.id}; }
    return admins.rowCount===1 && admin.status==='pending_invite' ? {kind:"conflicting_pending_admin"} : {kind:"already_initialized"}; }
  private async insertInvite(tx:AuthTransaction,c:BootstrapAdminCommand){ await tx.query("INSERT INTO invites(id,token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)",[c.invite.id,c.invite.tokenHash,c.userId,c.invite.expiresAt,c.now]); }
  private async audit(tx:AuthTransaction,c:BootstrapAdminCommand){ for(const e of c.auditEvents) await tx.query("INSERT INTO audit_log(id,correlation_id,actor_user_id,action,target_type,target_id,result,reason,metadata,ip_address,user_agent,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[randomUUID(),e.correlationId,e.actorUserId,e.action,e.targetType,e.targetId,e.result,e.reason,e.metadata,e.context.ipAddress,e.context.userAgent,e.occurredAt]); }

  /**
   * Convite novo: usuario `pending_invite`, papeis, permissoes diretas, o
   * proprio convite e a auditoria no mesmo commit. O convidado nunca escolhe o
   * proprio acesso -- ele ja nasce montado aqui, e o aceite so preenche senha e
   * telefone.
   */
  async createPendingUserWithAccessAndInvite(c:CreateInviteCommand):Promise<CreateInviteOutcome> {
    return this.db.transaction(async tx => {
      const existing=await tx.query("SELECT id FROM users WHERE email=$1",[c.email]);
      if (existing.rowCount) return {kind:"email_already_exists"} as const;
      await tx.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,$3,'pending_invite',$4,$4)",[c.userId,c.email,c.name,c.now]);
      for (const roleKey of c.roleKeys) await tx.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,$2)",[c.userId,roleKey]);
      for (const direct of c.directPermissions) await tx.query("INSERT INTO user_permissions(user_id,permission,effect) VALUES($1,$2,$3)",[c.userId,direct.permission,direct.effect]);
      await tx.query("INSERT INTO invites(id,token_hash,user_id,issuer_user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)",[c.invite.id,c.invite.tokenHash,c.userId,c.issuerUserId,c.invite.expiresAt,c.now]);
      await insertAuditEvents(tx,c.auditEvents);
      return {kind:"created",userId:c.userId} as const;
    });
  }

  /**
   * Reemissao preserva o RBAC de proposito: quem reemite quer outro link, nao
   * outro acesso. O que morre e todo convite anterior e toda tentativa de
   * aceite em aberto -- o link antigo, ja entregue por fora, para de valer no
   * mesmo instante em que o novo nasce.
   */
  async reissueInvite(c:ReissueInviteCommand):Promise<ReissueInviteOutcome> {
    return this.db.transaction(async tx => {
      const target=(await tx.query<{status:string}>("SELECT status FROM users WHERE id=$1 FOR UPDATE",[c.targetUserId])).rows[0];
      if (!target) return "not_found" as const;
      if (target.status!=="pending_invite") return "not_pending" as const;
      await invalidateOpenInvites(tx,c.targetUserId,c.now);
      await tx.query("INSERT INTO invites(id,token_hash,user_id,issuer_user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)",[c.invite.id,c.invite.tokenHash,c.targetUserId,c.issuerUserId,c.invite.expiresAt,c.now]);
      await insertAuditEvents(tx,c.auditEvents);
      return "reissued" as const;
    });
  }

  async revokeInvite(c:RevokeInviteCommand):Promise<RevokeInviteOutcome> {
    return this.db.transaction(async tx => {
      const target=(await tx.query<{status:string}>("SELECT status FROM users WHERE id=$1 FOR UPDATE",[c.targetUserId])).rows[0];
      if (!target) return "not_found" as const;
      await invalidateOpenInvites(tx,c.targetUserId,c.now);
      await insertAuditEvents(tx,c.auditEvents);
      return "revoked" as const;
    });
  }
}
