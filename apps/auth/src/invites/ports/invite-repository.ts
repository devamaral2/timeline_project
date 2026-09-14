import type { BootstrapAdminCommand, BootstrapAdminCommitOutcome, InviteInspection } from "../invite";

export interface AcceptInviteCommand {inviteId:string;userId:string;passwordHash:string;now:Date}

export interface InviteRepository {
  acceptInvite(command:AcceptInviteCommand):Promise<"accepted"|"invalid">;
  inspectByTokenHash(hash: string, now: Date): Promise<InviteInspection | null>;
  bootstrapAdmin(command: BootstrapAdminCommand): Promise<BootstrapAdminCommitOutcome>;
}
