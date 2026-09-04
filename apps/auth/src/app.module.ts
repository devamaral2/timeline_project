import { Module, type DynamicModule } from '@nestjs/common';
import { Clock, SystemClock } from './common/clock';
import {
  CryptoSecretGenerator,
  SecretGenerator,
} from './common/secret-generator';
import type { RuntimeEnv } from './config/env';
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
import { BearerAuthGuard } from './http/bearer-auth.guard';
import { AuthenticatedAuthController } from './http/authenticated-auth.controller';
import { RefreshSessionUseCase } from './sessions/usecases/refresh-session.usecase';
import { RevokeSessionUseCase } from './sessions/usecases/revoke-session.usecase';
import { LogoutAllUseCase } from './sessions/usecases/logout-all.usecase';
import { GetMeUseCase } from './sessions/usecases/get-me.usecase';

export const RUNTIME_ENV = Symbol('RUNTIME_ENV');

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule],
      controllers: [HealthController, JwksController, PublicAuthController, AuthenticatedAuthController],
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
        { provide: PostgresAuthenticationRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresAuthenticationRepository(db) },
        { provide: InspectInviteUseCase, inject: [PostgresInviteRepository, Clock], useFactory: (invites: PostgresInviteRepository, clock: Clock) => new InspectInviteUseCase(invites, clock) },
        { provide: StartInviteAcceptanceUseCase, inject: [PostgresInviteRepository, PreparePassword, OTP_VERIFICATION_GATEWAY, PostgresAuthenticationRepository, Clock, SecretGenerator], useFactory: (invites:PostgresInviteRepository,prepare:PreparePassword,otp:import('./mfa/otp-verification.gateway').OtpVerificationGateway,repo:PostgresAuthenticationRepository,clock:Clock,secrets:SecretGenerator) => new StartInviteAcceptanceUseCase(invites,prepare,otp,repo,clock,secrets) },
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
          provide: BearerAuthGuard,
          inject: [SigningKeyService, RUNTIME_ENV],
          useFactory: (keys: SigningKeyService, runtime: RuntimeEnv) => new BearerAuthGuard(keys, runtime),
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
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
