import { acquireAdvisoryLock, ADVISORY_LOCK } from "../db/transaction-locks";
import { randomUUID } from "node:crypto";
import type { AuthDatabase, AuthTransaction } from "../db/client";
import type { InviteRepository } from "./ports/invite-repository";
import type { BootstrapAdminCommand, BootstrapAdminCommitOutcome, InviteInspection } from "./invite";
export class PostgresInviteRepository implements InviteRepository {
  constructor(private readonly db: AuthDatabase) {}
  async inspectByTokenHash(hash:string, now:Date):Promise<InviteInspection|null> { const r=await this.db.query("SELECT i.id invite_id,i.user_id,u.name,u.email,i.expires_at FROM invites i JOIN users u ON u.id=i.user_id WHERE i.token_hash=$1 AND i.expires_at>$2 AND i.accepted_at IS NULL AND i.revoked_at IS NULL",[hash,now]); const x=r.rows[0]; return x ? {inviteId:x.invite_id,userId:x.user_id,name:x.name,email:x.email,expiresAt:x.expires_at}:null; }
  async bootstrapAdmin(command:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome> { return this.db.transaction(async tx => this.commit(tx,command)); }
  private async commit(tx:AuthTransaction,c:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome> { await acquireAdvisoryLock(tx,ADVISORY_LOCK.bootstrapAdmin); const admins=await tx.query("SELECT u.id,u.email,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_key='admin' FOR UPDATE"); if (admins.rowCount===0) { await tx.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,$3,'pending_invite',$4,$4)",[c.userId,c.email,c.name,c.now]); await tx.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,'admin')",[c.userId]); await this.insertInvite(tx,c); await this.audit(tx,c); return {kind:"created",userId:c.userId}; }
    const admin=admins.rows[0]; if (admins.rowCount===1 && admin.email===c.email && admin.status==='pending_invite') { await tx.query("UPDATE invites SET revoked_at=$1 WHERE user_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL",[c.now,admin.id]); await this.insertInvite(tx,{...c,userId:admin.id}); await this.audit(tx,c); return {kind:"reissued",userId:admin.id}; }
    return admins.rowCount===1 && admin.status==='pending_invite' ? {kind:"conflicting_pending_admin"} : {kind:"already_initialized"}; }
  private async insertInvite(tx:AuthTransaction,c:BootstrapAdminCommand){ await tx.query("INSERT INTO invites(id,token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)",[c.invite.id,c.invite.tokenHash,c.userId,c.invite.expiresAt,c.now]); }
  private async audit(tx:AuthTransaction,c:BootstrapAdminCommand){ for(const e of c.auditEvents) await tx.query("INSERT INTO audit_log(id,correlation_id,actor_user_id,action,target_type,target_id,result,reason,metadata,ip_address,user_agent,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[randomUUID(),e.correlationId,e.actorUserId,e.action,e.targetType,e.targetId,e.result,e.reason,e.metadata,e.context.ipAddress,e.context.userAgent,e.occurredAt]); }
}
