import type { Clock } from "../../common/clock";
import type { SecretGenerator } from "../../common/secret-generator";
import { hashSecretToken } from "../../crypto/secret-token";
import type { RequestContext } from "../../common/request-context";
import { normalizeEmail } from "../../users/user";
import type { InviteRepository } from "../ports/invite-repository";
import type { BootstrapAdminOutcome } from "../invite";
export class BootstrapAdminUseCase { constructor(private readonly invites:InviteRepository,private readonly clock:Clock,private readonly secrets:SecretGenerator) {} async execute(input:{email:string;name:string;context:RequestContext}):Promise<BootstrapAdminOutcome> { const email=normalizeEmail(input.email); const name=input.name.trim(); if(!email || !name) throw new Error("email and name are required"); const now=this.clock.now(), token=this.secrets.randomBytes(32).toString("base64url"), userId=this.secrets.randomId(); const outcome=await this.invites.bootstrapAdmin({email,name,userId,invite:{id:this.secrets.randomId(),tokenHash:hashSecretToken(token),expiresAt:new Date(now.getTime()+7*86400_000)},now,auditEvents:[{correlationId:input.context.correlationId,actorUserId:null,action:"bootstrap.admin_created",targetType:"user",targetId:userId,result:"succeeded",reason:null,metadata:{},context:input.context,occurredAt:now}]}); return outcome.kind==='created'||outcome.kind==='reissued'?{...outcome,inviteToken:token}:outcome; } }
