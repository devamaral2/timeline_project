import { AuthenticationFailedError, RateLimitedError, RequiredDependencyUnavailableError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { SecretGenerator } from "../../common/secret-generator";
import type { RequestContext } from "../../common/request-context";
import { SECURITY_POLICY } from "../../config/security-policy";
import { hashSecretToken } from "../../crypto/secret-token";
import type { SignAccessToken } from "../../crypto/jwt";
import { maskEmail } from "../../mfa/mfa-challenge";
import type { EmailOtpService } from "../../mfa/email-otp.service";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import { generateRecoveryCodes } from "../../mfa/recovery-code";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import { normalizeEmail, type User } from "../../users/user";
import type { UserReader } from "../../users/ports/user-repository";
import { LoginCredentialChecker } from "../login-credential-checker";
import type { SecondFactor } from "../../mfa/authentication-attempt";

export interface MfaChallengeOutput { mfaToken:string; secondFactor:SecondFactor; channel?:"email"; maskedDestination?:string; expiresAt:Date; }
export interface SessionTokensOutput { accessToken:string; refreshToken:string; accessTokenExpiresInSeconds:number; refreshTokenExpiresAt:string; recoveryCodes:string[]; }
export interface StartLoginInput { email:string; password:string; secondFactor:SecondFactor; context:RequestContext; }
export type StartLoginOutput = MfaChallengeOutput | SessionTokensOutput;
export class StartLoginUseCase {
  constructor(private readonly users:UserReader,private readonly credentials:LoginCredentialChecker,private readonly limiter:RateLimiter,private readonly otp:Pick<EmailOtpService,"start">,private readonly repo:AuthenticationRepository,private readonly clock:Clock,private readonly secrets:SecretGenerator,private readonly limits:{passwordEmail:{attempts:number;windowSeconds:number};passwordIp:{attempts:number;windowSeconds:number};mfaSendUser:{attempts:number;windowSeconds:number}},private readonly sign:SignAccessToken,private readonly mfaSuspended:boolean){}
  async execute(input:StartLoginInput):Promise<StartLoginOutput>{
    const now=this.clock.now(),email=normalizeEmail(input.email),password=input.password.normalize("NFC");
    const byEmail=await this.limiter.hit({scope:"password_email",subject:email,limit:this.limits.passwordEmail.attempts,windowSeconds:this.limits.passwordEmail.windowSeconds,now});
    const byIp=await this.limiter.hit({scope:"password_ip",subject:input.context.ipAddress??"unknown",limit:this.limits.passwordIp.attempts,windowSeconds:this.limits.passwordIp.windowSeconds,now});
    if(!byEmail.allowed||!byIp.allowed)throw new RateLimitedError(Math.max(byEmail.retryAfterSeconds,byIp.retryAfterSeconds),"password login");
    const user=await this.users.findByEmail(email); const valid=await this.credentials.check(user,password);
    if(!valid)throw new AuthenticationFailedError(user ? `login ${user.status}` : "unknown email");
    return this.startValid(user!,input.secondFactor,input.context,now);
  }
  private async startValid(user:User,secondFactor:SecondFactor,context:RequestContext,now:Date):Promise<StartLoginOutput>{
    if(this.mfaSuspended)return this.completeWithoutMfa(user,context,now);
    const token=this.secrets.randomBytes(32).toString("base64url"),expiresAt=new Date(now.getTime()+SECURITY_POLICY.authenticationAttemptTtlSeconds*1000);
    if(secondFactor==="recovery"){
      const result=await this.repo.startLoginAttempt({id:this.secrets.randomId(),tokenHash:hashSecretToken(token),userId:user.id,secondFactor,firstMethods:["pwd"],challenge:null,expiresAt,invalidatedAt:null,now,auditEvents:[]});
      if(result!=="created")throw new AuthenticationFailedError("login attempt invalid"); return {mfaToken:token,secondFactor,expiresAt};
    }
    const limited=await this.limiter.hit({scope:"mfa_send_user",subject:user.id,limit:this.limits.mfaSendUser.attempts,windowSeconds:this.limits.mfaSendUser.windowSeconds,now});
    if(!limited.allowed)throw new RateLimitedError(limited.retryAfterSeconds,"mfa send");
    const challengeId=this.secrets.randomId();
    let started;try{started=await this.otp.start({email:user.email,challengeId});}catch(error){throw new RequiredDependencyUnavailableError("otp start",{cause:error});}
    const challengeExpiresAt=new Date(now.getTime()+SECURITY_POLICY.mfaChallengeTtlSeconds*1000);
    const result=await this.repo.startLoginAttempt({id:this.secrets.randomId(),tokenHash:hashSecretToken(token),userId:user.id,secondFactor,firstMethods:["pwd"],challenge:{id:challengeId,codeHash:started.codeHash,expiresAt:challengeExpiresAt,invalidatedAt:null},expiresAt,invalidatedAt:null,now,auditEvents:[]});
    if(result!=="created")throw new AuthenticationFailedError("login attempt invalid");
    return {mfaToken:token,secondFactor,channel:"email",maskedDestination:maskEmail(user.email),expiresAt:challengeExpiresAt};
  }
  private async completeWithoutMfa(user:User,context:RequestContext,now:Date):Promise<SessionTokensOutput>{
    const refreshToken=this.secrets.randomBytes(32).toString("base64url"),refreshTokenExpiresAt=new Date(now.getTime()+SECURITY_POLICY.refreshTokenTtlSeconds*1000);
    const recoveryCodes=generateRecoveryCodes(this.secrets);
    const audit=(action:import("../../audit/audit-event").AuditAction):import("../../audit/audit-event").AuditEventInput=>({correlationId:context.correlationId,actorUserId:user.id,action,targetType:"user",targetId:user.id,result:"succeeded",reason:null,metadata:{},context,occurredAt:now});
    const committed=await this.repo.completeLoginWithoutMfa({
      userId:user.id,
      newSession:{id:this.secrets.randomId(),amr:["pwd"],authTime:now,issuedAt:now,context,refreshToken:{id:this.secrets.randomId(),hash:hashSecretToken(refreshToken),expiresAt:refreshTokenExpiresAt}},
      recoveryCodes,now,
      auditEvents:[audit("login.succeeded"),audit("recovery.generated"),audit("session.issued")],
    },this.sign);
    if(committed==="invalid")throw new AuthenticationFailedError("login attempt invalid");
    return {accessToken:committed.accessToken,refreshToken,accessTokenExpiresInSeconds:SECURITY_POLICY.accessTokenTtlSeconds,refreshTokenExpiresAt:committed.refreshTokenExpiresAt.toISOString(),recoveryCodes:recoveryCodes.map((code)=>code.plainText)};
  }
}
