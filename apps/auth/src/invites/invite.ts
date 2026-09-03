import type { AuditEventInput } from "../audit/audit-event";
export interface InviteInspection { inviteId:string; userId:string; name:string; email:string; expiresAt:Date; }
export interface BootstrapAdminCommand { email:string; name:string; userId:string; invite:{id:string;tokenHash:string;expiresAt:Date}; now:Date; auditEvents:readonly AuditEventInput[]; }
export type BootstrapAdminCommitOutcome = {kind:"created";userId:string}|{kind:"reissued";userId:string}|{kind:"already_initialized"}|{kind:"conflicting_pending_admin"};
export type BootstrapAdminOutcome = ({kind:"created"|"reissued";userId:string;inviteToken:string})|{kind:"already_initialized"}|{kind:"conflicting_pending_admin"};
export function inviteLink(webAppUrl: URL, token: string): string { const url=new URL("/convites/aceitar",webAppUrl); url.hash=new URLSearchParams({token}).toString(); return url.toString(); }
