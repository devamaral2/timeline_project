import { AcceptInviteUseCase } from './authentication/usecases/accept-invite.usecase';
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
import { PostgresAuthenticationRepository } from './authentication/postgres-authentication.repository';
import { PostgresUserRepository } from './users/postgres-user.repository';
import { PostgresRbacRepository } from './rbac/postgres-rbac.repository';
import { PostgresSessionRepository } from './sessions/postgres-session.repository';
import { AuthenticatedAuthController } from './http/authenticated-auth.controller';
import { RefreshSessionUseCase } from './sessions/usecases/refresh-session.usecase';
import { RevokeSessionUseCase } from './sessions/usecases/revoke-session.usecase';
import { LogoutAllUseCase } from './sessions/usecases/logout-all.usecase';
import { GetMeUseCase } from './sessions/usecases/get-me.usecase';
import { AdminAuthController } from './http/admin-auth.controller';
import { RequireSuperAdminGuard } from './http/require-permission.guard';
import { CreateInviteUseCase } from './invites/usecases/create-invite.usecase';
import { ReissueInviteUseCase } from './invites/usecases/reissue-invite.usecase';
import { RevokeInviteUseCase } from './invites/usecases/revoke-invite.usecase';
import { ListUsersUseCase } from './users/usecases/list-users.usecase';
import { ChangeUserStatusUseCase } from './users/usecases/change-user-status.usecase';
import { ReplaceUserAccessUseCase } from './users/usecases/replace-user-access.usecase';
import { RevokeUserSessionsUseCase } from './sessions/usecases/revoke-user-sessions.usecase';
import { PostgresRateLimiter } from './rate-limit/postgres-rate-limiter';
import { LoginCredentialChecker } from './authentication/login-credential-checker';
import { StartLoginUseCase } from './authentication/usecases/start-login.usecase';

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule],
      controllers: [HealthController, JwksController, PublicAuthController, AuthenticatedAuthController, AdminAuthController],
      providers: [
        { provide: AcceptInviteUseCase, inject: [PostgresInviteRepository,PreparePassword,Clock], useFactory: (repo:PostgresInviteRepository,password:PreparePassword,clock:Clock) => new AcceptInviteUseCase(repo,password,clock) },
        { provide: StartLoginUseCase, inject: [PostgresUserRepository,LoginCredentialChecker,PostgresRateLimiter,PostgresAuthenticationRepository,Clock,SecretGenerator,RUNTIME_ENV,SigningKeyService], useFactory: (users:PostgresUserRepository,credentials:LoginCredentialChecker,limiter:PostgresRateLimiter,repo:PostgresAuthenticationRepository,clock:Clock,secrets:SecretGenerator,env:RuntimeEnv,keys:SigningKeyService) => new StartLoginUseCase(users,credentials,limiter,repo,clock,secrets,env.limits,keys.signAccessToken) },

        { provide: RUNTIME_ENV, useValue: env },
        ...DbModule.providers(RUNTIME_ENV),
        { provide: Clock, useClass: SystemClock },
        { provide: SecretGenerator, useClass: CryptoSecretGenerator },
        { provide: ScryptPasswordHasher, useClass: ScryptPasswordHasher },
        { provide: HttpPwnedPasswordsGateway, inject: [RUNTIME_ENV], useFactory: (env: RuntimeEnv) => new HttpPwnedPasswordsGateway(env.passwordBlocklistTimeoutMs) },
        { provide: PreparePassword, inject: [HttpPwnedPasswordsGateway, ScryptPasswordHasher], useFactory: (pwned: HttpPwnedPasswordsGateway, hasher: ScryptPasswordHasher) => new PreparePassword(pwned, hasher) },
        { provide: PostgresInviteRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresInviteRepository(db) },
        { provide: PostgresAuthenticationRepository, inject: [AUTH_DATABASE, RUNTIME_ENV], useFactory: (db: import('./db/client').AuthDatabase, env: RuntimeEnv) => new PostgresAuthenticationRepository(db, env.issuer, env.audience) },
        { provide: PostgresUserRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresUserRepository(db) },
        { provide: PostgresRateLimiter, inject: [AUTH_DATABASE, RUNTIME_ENV], useFactory: (db: import('./db/client').AuthDatabase, env:RuntimeEnv) => new PostgresRateLimiter(db, env.keyEncryptionKey) },
        { provide: LoginCredentialChecker, inject: [ScryptPasswordHasher], useFactory: async (hasher:ScryptPasswordHasher) => new LoginCredentialChecker(hasher,await hasher.hash('timeline-auth-login-dummy')) },
        { provide: InspectInviteUseCase, inject: [PostgresInviteRepository, Clock], useFactory: (invites: PostgresInviteRepository, clock: Clock) => new InspectInviteUseCase(invites, clock) },
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
