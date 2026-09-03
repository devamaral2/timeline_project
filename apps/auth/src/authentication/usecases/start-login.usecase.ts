import { AuthenticationFailedError, RateLimitedError, RequiredDependencyUnavailableError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { SecretGenerator } from "../../common/secret-generator";
import type { RequestContext } from "../../common/request-context";
import { SECURITY_POLICY } from "../../config/security-policy";
import { hashSecretToken } from "../../crypto/secret-token";
import { maskPhone, type MfaChannel } from "../../mfa/mfa-challenge";
import type { OtpVerificationGateway } from "../../mfa/otp-verification.gateway";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import { normalizeEmail, type User } from "../../users/user";
import type { UserRepository } from "../../users/ports/user-repository";
import { LoginCredentialChecker } from "../login-credential-checker";
import type { SecondFactor } from "../../mfa/authentication-attempt";

export interface StartLoginInput { email:string; password:string; secondFactor:SecondFactor; context:RequestContext; }
export interface StartLoginOutput { mfaToken:string; secondFactor:SecondFactor; channel?:MfaChannel; maskedDestination?:string; expiresAt:Date; }
export class StartLoginUseCase {
  constructor(private readonly users:UserRepository,private readonly credentials:LoginCredentialChecker,private readonly limiter:RateLimiter,private readonly otp:OtpVerificationGateway,private readonly repo:AuthenticationRepository,private readonly clock:Clock,private readonly secrets:SecretGenerator,private readonly limits:{passwordEmail:{attempts:number;windowSeconds:number};passwordIp:{attempts:number;windowSeconds:number};mfaSendUser:{attempts:number;windowSeconds:number}}){}
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
    const token=this.secrets.randomBytes(32).toString("base64url"),expiresAt=new Date(now.getTime()+SECURITY_POLICY.authenticationAttemptTtlSeconds*1000);
    if(secondFactor==="recovery"){
      const result=await this.repo.startLoginAttempt({id:this.secrets.randomId(),tokenHash:hashSecretToken(token),userId:user.id,secondFactor,firstMethods:["pwd"],challenge:null,expiresAt,invalidatedAt:null,now,auditEvents:[]});
      if(result!=="created")throw new AuthenticationFailedError("login attempt invalid"); return {mfaToken:token,secondFactor,expiresAt};
    }
    if(!user.phoneE164||!user.mfaChannel)throw new AuthenticationFailedError("missing mfa enrollment");
    const limited=await this.limiter.hit({scope:"mfa_send_user",subject:user.id,limit:this.limits.mfaSendUser.attempts,windowSeconds:this.limits.mfaSendUser.windowSeconds,now});
    if(!limited.allowed)throw new RateLimitedError(limited.retryAfterSeconds,"mfa send");
    let started;try{started=await this.otp.start({phoneE164:user.phoneE164,channel:user.mfaChannel});}catch(error){throw new RequiredDependencyUnavailableError("otp start",{cause:error});}
    const mismatch=started.reportedChannel!==user.mfaChannel,challengeExpiresAt=new Date(now.getTime()+SECURITY_POLICY.mfaChallengeTtlSeconds*1000);
    const result=await this.repo.startLoginAttempt({id:this.secrets.randomId(),tokenHash:hashSecretToken(token),userId:user.id,secondFactor,firstMethods:["pwd"],challenge:{id:this.secrets.randomId(),providerChallengeId:started.providerChallengeId,requestedChannel:user.mfaChannel,reportedChannel:started.reportedChannel,expiresAt:challengeExpiresAt,invalidatedAt:mismatch?now:null},expiresAt,invalidatedAt:mismatch?now:null,now,auditEvents:[]});
    if(result!=="created"||mismatch)throw new RequiredDependencyUnavailableError("otp channel mismatch");
    return {mfaToken:token,secondFactor,channel:user.mfaChannel,maskedDestination:maskPhone(user.phoneE164),expiresAt};
  }
}
