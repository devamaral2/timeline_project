import { AuthenticationFailedError } from "../../common/errors";
import { hashSecretToken } from "../../crypto/secret-token";
import type { Clock } from "../../common/clock";
import type { InviteRepository } from "../ports/invite-repository";
export function maskInviteEmail(email:string):string { const at=email.indexOf("@"); if(at<1 || at!==email.lastIndexOf("@") || at===email.length-1) return "***"; return `${[...email.slice(0,at)][0]}***${email.slice(at)}`; }
export class InspectInviteUseCase { constructor(private readonly invites:InviteRepository,private readonly clock:Clock) {} async execute(token:string) { const inspection=await this.invites.inspectByTokenHash(hashSecretToken(token),this.clock.now()); if(!inspection) throw new AuthenticationFailedError("invalid invite"); return {name:inspection.name,email:maskInviteEmail(inspection.email),expiresAt:inspection.expiresAt}; } }
