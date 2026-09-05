import { Module, type DynamicModule } from '@nestjs/common';
import { Clock, SystemClock } from './common/clock';
import {
  CryptoSecretGenerator,
  SecretGenerator,
} from './common/secret-generator';
import type { RuntimeEnv } from './config/env';
import { RUNTIME_ENV } from './config/tokens';
import { HealthController } from './http/health.controller';
import { DbModule } from './db/db.module';
import { SigningKeyService } from './crypto/signing-key.service';
import { PostgresSigningKeyRepository } from './crypto/postgres-signing-key.repository';
import { AUTH_DATABASE } from './db/tokens';
import { JwksController } from './http/jwks.controller';
import { PublicAuthController } from './http/public-auth.controller';
import { PostgresInviteRepository } from './invites/postgres-invite.repository';
import { InspectInviteUseCase } from './invites/usecases/inspect-invite.usecase';
import { ScryptPasswordHasher } from './credentials/scrypt-password-hasher';
import { HttpPwnedPasswordsGateway } from './credentials/http-pwned-passwords.gateway';
import { PreparePassword } from './credentials/prepare-password';
import { TwilioVerifyGateway } from './mfa/twilio-verify.gateway';
import { FakeOtpVerificationGateway } from './mfa/fake-otp-verification.gateway';
import { OTP_VERIFICATION_GATEWAY } from './mfa/otp-verification.gateway';
import { PostgresAuthenticationRepository } from './mfa/postgres-authentication.repository';
import { StartInviteAcceptanceUseCase } from './authentication/usecases/start-invite-acceptance.usecase';
import { PostgresUserRepository } from './users/postgres-user.repository';
import { PostgresRbacRepository } from './rbac/postgres-rbac.repository';
import { PostgresSessionRepository } from './sessions/postgres-session.repository';
import { AuthenticatedAuthController } from './http/authenticated-auth.controller';
import { RefreshSessionUseCase } from './sessions/usecases/refresh-session.usecase';
import { RevokeSessionUseCase } from './sessions/usecases/revoke-session.usecase';
import { LogoutAllUseCase } from './sessions/usecases/logout-all.usecase';
import { GetMeUseCase } from './sessions/usecases/get-me.usecase';
import { CompleteInviteAcceptanceUseCase } from './authentication/usecases/complete-invite-acceptance.usecase';
import { VerifyMfaUseCase } from './authentication/usecases/verify-mfa.usecase';
import { AdminAuthController } from './http/admin-auth.controller';
import { RequireSuperAdminGuard } from './http/require-permission.guard';
import { CreateInviteUseCase } from './invites/usecases/create-invite.usecase';
import { ReissueInviteUseCase } from './invites/usecases/reissue-invite.usecase';
import { RevokeInviteUseCase } from './invites/usecases/revoke-invite.usecase';
import { ListUsersUseCase } from './users/usecases/list-users.usecase';
import { ChangeUserStatusUseCase } from './users/usecases/change-user-status.usecase';
import { ReplaceUserAccessUseCase } from './users/usecases/replace-user-access.usecase';
import { RevokeUserSessionsUseCase } from './sessions/usecases/revoke-user-sessions.usecase';
import { StartStepUpUseCase } from './authentication/usecases/start-step-up.usecase';
import { CompleteStepUpUseCase } from './authentication/usecases/complete-step-up.usecase';
import { ChangePasswordUseCase } from './authentication/usecases/change-password.usecase';
import { RegenerateRecoveryCodesUseCase } from './authentication/usecases/regenerate-recovery-codes.usecase';
import { PostgresRateLimiter } from './rate-limit/postgres-rate-limiter';
import { LoginCredentialChecker } from './authentication/login-credential-checker';
import { StartLoginUseCase } from './authentication/usecases/start-login.usecase';
import { CompleteLoginUseCase } from './authentication/usecases/complete-login.usecase';
import { ResendMfaUseCase } from './authentication/usecases/resend-mfa.usecase';

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule],
      controllers: [HealthController, JwksController, PublicAuthController, AuthenticatedAuthController, AdminAuthController],
      providers: [
        { provide: RUNTIME_ENV, useValue: env },
        ...DbModule.providers(RUNTIME_ENV),
        { provide: Clock, useClass: SystemClock },
        { provide: SecretGenerator, useClass: CryptoSecretGenerator },
        { provide: ScryptPasswordHasher, useClass: ScryptPasswordHasher },
        { provide: HttpPwnedPasswordsGateway, inject: [RUNTIME_ENV], useFactory: (env: RuntimeEnv) => new HttpPwnedPasswordsGateway(env.passwordBlocklistTimeoutMs) },
        { provide: PreparePassword, inject: [HttpPwnedPasswordsGateway, ScryptPasswordHasher], useFactory: (pwned: HttpPwnedPasswordsGateway, hasher: ScryptPasswordHasher) => new PreparePassword(pwned, hasher) },
        { provide: OTP_VERIFICATION_GATEWAY, inject: [RUNTIME_ENV], useFactory: (env: RuntimeEnv) => env.otpProvider === 'fake' ? new FakeOtpVerificationGateway() : new TwilioVerifyGateway({ accountSid: env.twilioAccountSid!, authToken: env.twilioAuthToken!, verifyServiceSid: env.twilioVerifyServiceSid!, timeoutMs: env.twilioTimeoutMs, whatsappEnabled: env.twilioWhatsappEnabled }) },
        { provide: PostgresInviteRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresInviteRepository(db) },
        { provide: PostgresAuthenticationRepository, inject: [AUTH_DATABASE, RUNTIME_ENV], useFactory: (db: import('./db/client').AuthDatabase, env: RuntimeEnv) => new PostgresAuthenticationRepository(db, env.issuer, env.audience) },
        { provide: PostgresUserRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresUserRepository(db) },
        { provide: PostgresRateLimiter, inject: [AUTH_DATABASE, RUNTIME_ENV], useFactory: (db: import('./db/client').AuthDatabase, env:RuntimeEnv) => new PostgresRateLimiter(db, env.keyEncryptionKey) },
        { provide: LoginCredentialChecker, inject: [ScryptPasswordHasher], useFactory: async (hasher:ScryptPasswordHasher) => new LoginCredentialChecker(hasher,await hasher.hash('timeline-auth-login-dummy')) },
        { provide: InspectInviteUseCase, inject: [PostgresInviteRepository, Clock], useFactory: (invites: PostgresInviteRepository, clock: Clock) => new InspectInviteUseCase(invites, clock) },
        { provide: StartInviteAcceptanceUseCase, inject: [PostgresInviteRepository, PreparePassword, OTP_VERIFICATION_GATEWAY, PostgresAuthenticationRepository, Clock, SecretGenerator], useFactory: (invites:PostgresInviteRepository,prepare:PreparePassword,otp:import('./mfa/otp-verification.gateway').OtpVerificationGateway,repo:PostgresAuthenticationRepository,clock:Clock,secrets:SecretGenerator) => new StartInviteAcceptanceUseCase(invites,prepare,otp,repo,clock,secrets) },
        { provide: StartLoginUseCase, inject: [PostgresUserRepository, LoginCredentialChecker, PostgresRateLimiter, OTP_VERIFICATION_GATEWAY, PostgresAuthenticationRepository, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (users:PostgresUserRepository,checker:LoginCredentialChecker,limiter:PostgresRateLimiter,otp:import('./mfa/otp-verification.gateway').OtpVerificationGateway,repo:PostgresAuthenticationRepository,clock:Clock,secrets:SecretGenerator,env:RuntimeEnv) => new StartLoginUseCase(users,checker,limiter,otp,repo,clock,secrets,env.limits) },
        { provide: CompleteLoginUseCase, inject: [PostgresAuthenticationRepository, OTP_VERIFICATION_GATEWAY, PostgresRateLimiter, SigningKeyService, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (repo:PostgresAuthenticationRepository,otp:import('./mfa/otp-verification.gateway').OtpVerificationGateway,limiter:PostgresRateLimiter,signing:SigningKeyService,clock:Clock,secrets:SecretGenerator,env:RuntimeEnv) => new CompleteLoginUseCase(repo,otp,limiter,signing.signAccessToken,clock,secrets,env.limits.factorCheckAttempt) },
        { provide: ResendMfaUseCase, inject: [PostgresAuthenticationRepository, PostgresRateLimiter, OTP_VERIFICATION_GATEWAY, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (repo:PostgresAuthenticationRepository,limiter:PostgresRateLimiter,otp:import('./mfa/otp-verification.gateway').OtpVerificationGateway,clock:Clock,secrets:SecretGenerator,env:RuntimeEnv) => new ResendMfaUseCase(repo,limiter,otp,clock,secrets,env.limits.mfaSendUser) },
        {
          provide: PostgresSigningKeyRepository,
          inject: [AUTH_DATABASE],
          useFactory: (db: import('./db/client').AuthDatabase) =>
            new PostgresSigningKeyRepository(db),
        },
        {
          provide: SigningKeyService,
          inject: [PostgresSigningKeyRepository, RUNTIME_ENV, SecretGenerator],
          useFactory: (
            repository: PostgresSigningKeyRepository,
            runtime: RuntimeEnv,
            secrets: SecretGenerator,
          ) =>
            new SigningKeyService(
              repository,
              runtime.keyEncryptionKey,
              secrets,
            ),
        },
        { provide: PostgresUserRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresUserRepository(db) },
        { provide: PostgresRbacRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresRbacRepository(db) },
        {
          provide: PostgresSessionRepository,
          inject: [AUTH_DATABASE, RUNTIME_ENV],
          useFactory: (db: import('./db/client').AuthDatabase, runtime: RuntimeEnv) =>
            new PostgresSessionRepository(db, runtime.issuer, runtime.audience),
        },
        {
          provide: RefreshSessionUseCase,
          inject: [PostgresSessionRepository, SigningKeyService, Clock, SecretGenerator],
          useFactory: (sessions: PostgresSessionRepository, keys: SigningKeyService, clock: Clock, secrets: SecretGenerator) =>
            new RefreshSessionUseCase(sessions, keys.signAccessToken, clock, secrets),
        },
        {
          provide: RevokeSessionUseCase,
          inject: [PostgresSessionRepository, Clock],
          useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new RevokeSessionUseCase(sessions, clock),
        },
        {
          provide: LogoutAllUseCase,
          inject: [PostgresSessionRepository, Clock],
          useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new LogoutAllUseCase(sessions, clock),
        },
        {
          provide: GetMeUseCase,
          inject: [PostgresSessionRepository, PostgresUserRepository, PostgresRbacRepository],
          useFactory: (sessions: PostgresSessionRepository, users: PostgresUserRepository, rbac: PostgresRbacRepository) =>
            new GetMeUseCase(sessions, users, rbac),
        },
        { provide: CompleteInviteAcceptanceUseCase, inject: [OTP_VERIFICATION_GATEWAY, PostgresAuthenticationRepository, Clock, SecretGenerator, SigningKeyService], useFactory: (otp: import('./mfa/otp-verification.gateway').OtpVerificationGateway, repo: PostgresAuthenticationRepository, clock: Clock, secrets: SecretGenerator, signingKeys: SigningKeyService) => new CompleteInviteAcceptanceUseCase(otp, repo, clock, secrets, signingKeys.signAccessToken) },
        { provide: VerifyMfaUseCase, inject: [PostgresAuthenticationRepository, CompleteInviteAcceptanceUseCase, CompleteLoginUseCase, Clock], useFactory: (repo: PostgresAuthenticationRepository, invite: CompleteInviteAcceptanceUseCase, login: CompleteLoginUseCase, clock: Clock) => new VerifyMfaUseCase(repo, invite, login, clock) },
        { provide: StartStepUpUseCase, inject: [PostgresUserRepository, PostgresAuthenticationRepository, OTP_VERIFICATION_GATEWAY, PostgresRateLimiter, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (users: PostgresUserRepository, repo: PostgresAuthenticationRepository, otp: import('./mfa/otp-verification.gateway').OtpVerificationGateway, limiter: PostgresRateLimiter, clock: Clock, secrets: SecretGenerator, env: RuntimeEnv) => new StartStepUpUseCase(users, repo, otp, limiter, clock, secrets, { mfaSendUser: env.limits.mfaSendUser }) },
        { provide: CompleteStepUpUseCase, inject: [PostgresAuthenticationRepository, OTP_VERIFICATION_GATEWAY, PostgresRateLimiter, Clock, RUNTIME_ENV], useFactory: (repo: PostgresAuthenticationRepository, otp: import('./mfa/otp-verification.gateway').OtpVerificationGateway, limiter: PostgresRateLimiter, clock: Clock, env: RuntimeEnv) => new CompleteStepUpUseCase(repo, otp, limiter, clock, { factorCheckAttempt: env.limits.factorCheckAttempt }) },
        { provide: ChangePasswordUseCase, inject: [PostgresUserRepository, PostgresAuthenticationRepository, PreparePassword, Clock, SecretGenerator, SigningKeyService], useFactory: (users: PostgresUserRepository, repo: PostgresAuthenticationRepository, prepare: PreparePassword, clock: Clock, secrets: SecretGenerator, signingKeys: SigningKeyService) => new ChangePasswordUseCase(users, repo, prepare, clock, secrets, signingKeys.signAccessToken) },
        { provide: RegenerateRecoveryCodesUseCase, inject: [PostgresAuthenticationRepository, Clock, SecretGenerator], useFactory: (repo: PostgresAuthenticationRepository, clock: Clock, secrets: SecretGenerator) => new RegenerateRecoveryCodesUseCase(repo, clock, secrets) },
        { provide: RequireSuperAdminGuard, useClass: RequireSuperAdminGuard },
        { provide: CreateInviteUseCase, inject: [PostgresInviteRepository, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (invites: PostgresInviteRepository, clock: Clock, secrets: SecretGenerator, env: RuntimeEnv) => new CreateInviteUseCase(invites, clock, secrets, env.webAppUrl) },
        { provide: ReissueInviteUseCase, inject: [PostgresInviteRepository, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (invites: PostgresInviteRepository, clock: Clock, secrets: SecretGenerator, env: RuntimeEnv) => new ReissueInviteUseCase(invites, clock, secrets, env.webAppUrl) },
        { provide: RevokeInviteUseCase, inject: [PostgresInviteRepository, Clock], useFactory: (invites: PostgresInviteRepository, clock: Clock) => new RevokeInviteUseCase(invites, clock) },
        { provide: ListUsersUseCase, inject: [PostgresUserRepository], useFactory: (users: PostgresUserRepository) => new ListUsersUseCase(users) },
        { provide: ChangeUserStatusUseCase, inject: [PostgresUserRepository, Clock], useFactory: (users: PostgresUserRepository, clock: Clock) => new ChangeUserStatusUseCase(users, clock) },
        { provide: ReplaceUserAccessUseCase, inject: [PostgresUserRepository, Clock], useFactory: (users: PostgresUserRepository, clock: Clock) => new ReplaceUserAccessUseCase(users, clock) },
        { provide: RevokeUserSessionsUseCase, inject: [PostgresSessionRepository, Clock], useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new RevokeUserSessionsUseCase(sessions, clock) },
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
