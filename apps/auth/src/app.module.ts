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

export const RUNTIME_ENV = Symbol('RUNTIME_ENV');

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule],
      controllers: [HealthController, JwksController, PublicAuthController],
      providers: [
        { provide: RUNTIME_ENV, useValue: env },
        ...DbModule.providers(RUNTIME_ENV),
        { provide: Clock, useClass: SystemClock },
        { provide: SecretGenerator, useClass: CryptoSecretGenerator },
        { provide: ScryptPasswordHasher, useClass: ScryptPasswordHasher },
        { provide: HttpPwnedPasswordsGateway, inject: [RUNTIME_ENV], useFactory: (env: RuntimeEnv) => new HttpPwnedPasswordsGateway(env.passwordBlocklistTimeoutMs) },
        { provide: PreparePassword, inject: [HttpPwnedPasswordsGateway, ScryptPasswordHasher], useFactory: (pwned: HttpPwnedPasswordsGateway, hasher: ScryptPasswordHasher) => new PreparePassword(pwned, hasher) },
        { provide: PostgresInviteRepository, inject: [AUTH_DATABASE], useFactory: (db: import('./db/client').AuthDatabase) => new PostgresInviteRepository(db) },
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
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
