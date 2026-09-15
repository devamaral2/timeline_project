import type { MintToken } from "../../crypto/jwt";

export interface IssueGuestCommand {
  issuerUserId: string;
  issuerSessionId: string;
  subjectUserId: string;
  guestId: string;
  /** `guest_<hash>`. */
  guestName: string;
  now: Date;
  issuer: string;
  audience: string;
}

export type IssueGuestOutcome =
  | { kind: "issued"; guestId: string; token: string; jti: string; expiresAt: Date }
  /** O emissor deixou de ser um admin ativo com sessao viva desde que o token foi assinado. */
  | { kind: "issuer_not_admin" }
  | { kind: "subject_not_found" }
  /** Alvo que nao esta `active`: placeholder de signup, conta inativa ou outro guest. */
  | { kind: "subject_not_eligible" };

export interface GuestRepository {
  issueGuest(command: IssueGuestCommand, mint: MintToken): Promise<IssueGuestOutcome>;
  /** `true` quando havia um guest com esse id. Apagar a linha leva o papel junto (cascata). */
  deleteGuest(guestId: string): Promise<boolean>;
}
