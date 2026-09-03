import type { BootstrapAdminCommand, BootstrapAdminCommitOutcome, InviteInspection } from "../invite";
export interface InviteRepository { inspectByTokenHash(hash:string,now:Date):Promise<InviteInspection|null>; bootstrapAdmin(command:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome>; }
