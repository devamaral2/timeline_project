import { Module, type DynamicModule } from '@nestjs/common';
import { Clock, SystemClock } from '../common/clock';
import { CryptoSecretGenerator, SecretGenerator } from '../common/secret-generator';
import type { RuntimeEnv } from '../config/env';
import { RUNTIME_ENV } from '../config/tokens';
import { AUTH_DATABASE } from '../db/tokens';
import { DbModule } from '../db/db.module';
import type { AuthDatabase } from '../db/client';
import { HttpPwnedPasswordsGateway } from './password/http-pwned-passwords.gateway';
import { PreparePassword } from './password/prepare-password';
import { ScryptPasswordHasher } from './password/scrypt-password-hasher';
import { PostgresInviteRepository } from './persistence/postgres-invite.repository';
import { PostgresRbacRepository } from './persistence/postgres-rbac.repository';
import { PostgresSessionRepository } from './persistence/postgres-session.repository';
import { PostgresUserRepository } from './persistence/postgres-user.repository';
import { AuthorizationService } from './security/authorization.service';
import { BearerAuthGuard } from './security/bearer-auth.guard';
import { PostgresSigningKeyRepository } from './security/postgres-signing-key.repository';
import { RequireSuperAdminGuard } from './security/require-super-admin.guard';
import { SigningKeyService } from './security/signing-key.service';

@Module({})
export class AuthCoreModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    const providers = [
      { provide: RUNTIME_ENV, useValue: env },
      ...DbModule.providers(RUNTIME_ENV),
      { provide: Clock, useClass: SystemClock },
      { provide: SecretGenerator, useClass: CryptoSecretGenerator },
      { provide: ScryptPasswordHasher, useClass: ScryptPasswordHasher },
      {
        provide: HttpPwnedPasswordsGateway,
        inject: [RUNTIME_ENV],
        useFactory: (runtime: RuntimeEnv) => new HttpPwnedPasswordsGateway(runtime.passwordBlocklistTimeoutMs),
      },
      {
        provide: PreparePassword,
        inject: [HttpPwnedPasswordsGateway, ScryptPasswordHasher],
        useFactory: (pwned: HttpPwnedPasswordsGateway, hasher: ScryptPasswordHasher) => new PreparePassword(pwned, hasher),
      },
      {
        provide: PostgresInviteRepository,
        inject: [AUTH_DATABASE],
        useFactory: (db: AuthDatabase) => new PostgresInviteRepository(db),
      },
      {
        provide: PostgresRbacRepository,
        inject: [AUTH_DATABASE],
        useFactory: (db: AuthDatabase) => new PostgresRbacRepository(db),
      },
      {
        provide: PostgresUserRepository,
        inject: [AUTH_DATABASE],
        useFactory: (db: AuthDatabase) => new PostgresUserRepository(db),
      },
      {
        provide: PostgresSessionRepository,
        inject: [AUTH_DATABASE, RUNTIME_ENV],
        useFactory: (db: AuthDatabase, runtime: RuntimeEnv) => new PostgresSessionRepository(db, runtime.issuer, runtime.audience),
      },
      {
        provide: PostgresSigningKeyRepository,
        inject: [AUTH_DATABASE],
        useFactory: (db: AuthDatabase) => new PostgresSigningKeyRepository(db),
      },
      {
        provide: SigningKeyService,
        inject: [PostgresSigningKeyRepository, RUNTIME_ENV, SecretGenerator],
        useFactory: (repository: PostgresSigningKeyRepository, runtime: RuntimeEnv, secrets: SecretGenerator) =>
          new SigningKeyService(repository, runtime.keyEncryptionKey, secrets),
      },
      {
        provide: AuthorizationService,
        inject: [PostgresSessionRepository, PostgresUserRepository, PostgresRbacRepository],
        useFactory: (sessions: PostgresSessionRepository, users: PostgresUserRepository, rbac: PostgresRbacRepository) =>
          new AuthorizationService(sessions, users, rbac),
      },
      { provide: BearerAuthGuard, useClass: BearerAuthGuard },
      { provide: RequireSuperAdminGuard, useClass: RequireSuperAdminGuard },
    ];

    return {
      global: true,
      module: AuthCoreModule,
      imports: [DbModule],
      providers,
      exports: [
        RUNTIME_ENV,
        AUTH_DATABASE,
        Clock,
        SecretGenerator,
        ScryptPasswordHasher,
        HttpPwnedPasswordsGateway,
        PreparePassword,
        PostgresInviteRepository,
        PostgresRbacRepository,
        PostgresSessionRepository,
        PostgresUserRepository,
        PostgresSigningKeyRepository,
        SigningKeyService,
        AuthorizationService,
        BearerAuthGuard,
        RequireSuperAdminGuard,
      ],
    };
  }
}
