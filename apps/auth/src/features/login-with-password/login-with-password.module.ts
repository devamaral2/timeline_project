import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { RUNTIME_ENV } from '../../config/tokens';
import type { RuntimeEnv } from '../../config/env';
import { AUTH_DATABASE } from '../../db/tokens';
import type { AuthDatabase } from '../../db/client';
import { Clock } from '../../common/clock';
import { SecretGenerator } from '../../common/secret-generator';
import { SigningKeyService } from '../../auth-core/security/signing-key.service';
import { PostgresUserRepository } from '../../auth-core/persistence/postgres-user.repository';
import { ScryptPasswordHasher } from '../../auth-core/password/scrypt-password-hasher';
import { LoginWithPasswordController } from './http/login-with-password.controller';
import { LoginWithPasswordUseCase } from './usecases/login-with-password.usecase';
import { LoginCredentialChecker } from './services/login-credential-checker';
import { PostgresRateLimiter } from './services/rate-limit/postgres-rate-limiter';
import { PostgresLoginRepository } from './postgres-login.repository';

@Module({
  imports: [AuthCoreModule],
  controllers: [LoginWithPasswordController],
  providers: [
    {
      provide: PostgresLoginRepository,
      inject: [AUTH_DATABASE, RUNTIME_ENV],
      useFactory: (db: AuthDatabase, runtime: RuntimeEnv) => new PostgresLoginRepository(db, runtime.issuer, runtime.audience),
    },
    {
      provide: PostgresRateLimiter,
      inject: [AUTH_DATABASE, RUNTIME_ENV],
      useFactory: (db: AuthDatabase, runtime: RuntimeEnv) => new PostgresRateLimiter(db, runtime.keyEncryptionKey),
    },
    {
      provide: LoginCredentialChecker,
      inject: [ScryptPasswordHasher],
      useFactory: async (hasher: ScryptPasswordHasher) => new LoginCredentialChecker(hasher, await hasher.hash('timeline-auth-login-dummy')),
    },
    {
      provide: LoginWithPasswordUseCase,
      inject: [PostgresUserRepository, LoginCredentialChecker, PostgresRateLimiter, PostgresLoginRepository, Clock, SecretGenerator, RUNTIME_ENV, SigningKeyService],
      useFactory: (
        users: PostgresUserRepository,
        credentials: LoginCredentialChecker,
        limiter: PostgresRateLimiter,
        repository: PostgresLoginRepository,
        clock: Clock,
        secrets: SecretGenerator,
        runtime: RuntimeEnv,
        keys: SigningKeyService,
      ) => new LoginWithPasswordUseCase(users, credentials, limiter, repository, clock, secrets, runtime.limits, keys.signAccessToken),
    },
  ],
})
export class LoginWithPasswordModule {}
