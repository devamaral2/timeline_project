import { Module, type DynamicModule } from '@nestjs/common';
import { LoginCredentialChecker } from './authentication/login-credential-checker';
import { LoginUseCase } from './authentication/usecases/login.usecase';
import { Clock, SystemClock } from './common/clock';
import { CryptoSecretGenerator, SecretGenerator } from './common/secret-generator';
import type { RuntimeEnv } from './config/env';
import { RUNTIME_ENV } from './config/tokens';
import { ScryptPasswordHasher } from './credentials/scrypt-password-hasher';
import { PostgresSigningKeyRepository } from './crypto/postgres-signing-key.repository';
import { SigningKeyService } from './crypto/signing-key.service';
import type { AuthDatabase } from './db/client';
import { DbModule } from './db/db.module';
import { AUTH_DATABASE } from './db/tokens';
import { AuthenticatedAuthController } from './http/authenticated-auth.controller';
import { HealthController } from './http/health.controller';
import { JwksController } from './http/jwks.controller';
import { PublicAuthController } from './http/public-auth.controller';
import { PostgresRateLimiter } from './rate-limit/postgres-rate-limiter';
import { PostgresRbacRepository } from './rbac/postgres-rbac.repository';
import { PostgresSessionRepository } from './sessions/postgres-session.repository';
import { GetMeUseCase } from './sessions/usecases/get-me.usecase';
import { LogoutAllUseCase } from './sessions/usecases/logout-all.usecase';
import { RefreshSessionUseCase } from './sessions/usecases/refresh-session.usecase';
import { RevokeSessionUseCase } from './sessions/usecases/revoke-session.usecase';
import { PostgresUserRepository } from './users/postgres-user.repository';

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
        { provide: LoginCredentialChecker, inject: [ScryptPasswordHasher], useFactory: async (hasher: ScryptPasswordHasher) => new LoginCredentialChecker(hasher, await hasher.hash('timeline-auth-login-dummy')) },

        { provide: PostgresSigningKeyRepository, inject: [AUTH_DATABASE], useFactory: (db: AuthDatabase) => new PostgresSigningKeyRepository(db) },
        { provide: SigningKeyService, inject: [PostgresSigningKeyRepository, RUNTIME_ENV, SecretGenerator], useFactory: (repository: PostgresSigningKeyRepository, runtime: RuntimeEnv, secrets: SecretGenerator) => new SigningKeyService(repository, runtime.keyEncryptionKey, secrets) },
        { provide: PostgresUserRepository, inject: [AUTH_DATABASE], useFactory: (db: AuthDatabase) => new PostgresUserRepository(db) },
        { provide: PostgresRbacRepository, inject: [AUTH_DATABASE], useFactory: (db: AuthDatabase) => new PostgresRbacRepository(db) },
        { provide: PostgresRateLimiter, inject: [AUTH_DATABASE, RUNTIME_ENV], useFactory: (db: AuthDatabase, runtime: RuntimeEnv) => new PostgresRateLimiter(db, runtime.keyEncryptionKey) },
        { provide: PostgresSessionRepository, inject: [AUTH_DATABASE, RUNTIME_ENV], useFactory: (db: AuthDatabase, runtime: RuntimeEnv) => new PostgresSessionRepository(db, runtime.issuer, runtime.audience) },

        { provide: LoginUseCase, inject: [PostgresUserRepository, LoginCredentialChecker, PostgresRateLimiter, PostgresSessionRepository, SigningKeyService, Clock, SecretGenerator, RUNTIME_ENV], useFactory: (users: PostgresUserRepository, credentials: LoginCredentialChecker, limiter: PostgresRateLimiter, sessions: PostgresSessionRepository, keys: SigningKeyService, clock: Clock, secrets: SecretGenerator, runtime: RuntimeEnv) => new LoginUseCase(users, credentials, limiter, sessions, keys.signAccessToken, clock, secrets, runtime.limits) },
        { provide: RefreshSessionUseCase, inject: [PostgresSessionRepository, SigningKeyService, Clock, SecretGenerator], useFactory: (sessions: PostgresSessionRepository, keys: SigningKeyService, clock: Clock, secrets: SecretGenerator) => new RefreshSessionUseCase(sessions, keys.signAccessToken, clock, secrets) },
        { provide: RevokeSessionUseCase, inject: [PostgresSessionRepository, Clock], useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new RevokeSessionUseCase(sessions, clock) },
        { provide: LogoutAllUseCase, inject: [PostgresSessionRepository, Clock], useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new LogoutAllUseCase(sessions, clock) },
        { provide: GetMeUseCase, inject: [PostgresSessionRepository, PostgresUserRepository, PostgresRbacRepository], useFactory: (sessions: PostgresSessionRepository, users: PostgresUserRepository, rbac: PostgresRbacRepository) => new GetMeUseCase(sessions, users, rbac) },
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
