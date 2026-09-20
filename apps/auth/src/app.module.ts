import { AcceptInviteUseCase } from './features/invite-user/usecases/accept-invite.usecase';
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
import { SigningKeyService } from './features/authenticate-user/signing-key.service';
import { PostgresSigningKeyRepository } from './features/authenticate-user/postgres-signing-key.repository';
import { AUTH_DATABASE } from './db/tokens';
import { JwksController } from './features/authenticate-user/http/jwks.controller';
import { BasicLoginController } from './features/basic-login/http/basic-login.controller';
import { PublicInviteController } from './features/invite-user/http/public-invite.controller';
import { PostgresInviteRepository } from './features/invite-user/postgres-invite.repository';
import { InspectInviteUseCase } from './features/invite-user/usecases/inspect-invite.usecase';
import { ScryptPasswordHasher } from './features/basic-login/credentials/scrypt-password-hasher';
import { HttpPwnedPasswordsGateway } from './features/basic-login/credentials/http-pwned-passwords.gateway';
import { PreparePassword } from './features/basic-login/credentials/prepare-password';
import { PostgresAuthenticationRepository } from './features/basic-login/postgres-authentication.repository';
import { PostgresUserRepository } from './features/user-lookup/postgres-user.repository';
import { PostgresRbacRepository } from './features/authorize-access/rbac/postgres-rbac.repository';
import { PostgresSessionRepository } from './features/manage-session/postgres-session.repository';
import { AuthenticatedAuthController } from './features/manage-session/http/authenticated-auth.controller';
import { RefreshSessionUseCase } from './features/manage-session/usecases/refresh-session.usecase';
import { RevokeSessionUseCase } from './features/manage-session/usecases/revoke-session.usecase';
import { LogoutAllUseCase } from './features/manage-session/usecases/logout-all.usecase';
import { GetMeUseCase } from './features/manage-session/usecases/get-me.usecase';
import { AdminAuthController } from './features/invite-user/http/admin-auth.controller';
import { RequireSuperAdminGuard } from './features/authorize-access/http/require-permission.guard';
import { CreateInviteUseCase } from './features/invite-user/usecases/create-invite.usecase';
import { PostgresRateLimiter } from './features/basic-login/rate-limit/postgres-rate-limiter';
import { LoginCredentialChecker } from './features/basic-login/login-credential-checker';
import { StartLoginUseCase } from './features/basic-login/usecases/start-login.usecase';
import { InternalAuthorizeController } from './features/authorize-access/internal-authorize.controller';
import { AuthorizeAccessUseCase } from './features/authorize-access/authorize-access.usecase';

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule],
      controllers: [HealthController, JwksController, BasicLoginController, PublicInviteController, AuthenticatedAuthController, AdminAuthController, InternalAuthorizeController],
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
        { provide: AuthorizeAccessUseCase, inject: [PostgresSessionRepository, PostgresUserRepository, PostgresRbacRepository], useFactory: (sessions: PostgresSessionRepository, users: PostgresUserRepository, rbac: PostgresRbacRepository) => new AuthorizeAccessUseCase(sessions, users, rbac) },
        { provide: RequireSuperAdminGuard, useClass: RequireSuperAdminGuard },
        { provide: CreateInviteUseCase, inject: [PostgresInviteRepository, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (invites: PostgresInviteRepository, clock: Clock, secrets: SecretGenerator, env: RuntimeEnv) => new CreateInviteUseCase(invites, clock, secrets, env.webAppUrl) },
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
