import type { Invite } from "../invite";

export interface InviteRepository {
  findByTokenHash(tokenHash: string): Promise<Invite | null>;
  findById(inviteId: string): Promise<Invite | null>;
  findPendingByEmail(email: string): Promise<Invite | null>;
  save(invite: Invite): Promise<void>;
  listPending(): Promise<Invite[]>;
}
