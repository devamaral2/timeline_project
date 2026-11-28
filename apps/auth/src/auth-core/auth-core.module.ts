import { Module, type DynamicModule } from '@nestjs/common';
import { Clock } from '../common/clock';
import { SecretGenerator } from '../common/secret-generator';
import type { RuntimeEnv } from '../config/env';
import { RUNTIME_ENV } from '../config/tokens';
import { AUTH_DATABASE } from '../db/tokens';
import type { AuthCore } from '../composition-root';
import { HttpPwnedPasswordsGateway } from './password/http-pwned-passwords.gateway';
import { PreparePassword } from './password/prepare-password';
import { ScryptPasswordHasher } from './password/scrypt-password-hasher';
import { PostgresDeviceKeyRepository } from './persistence/postgres-device-key.repository';
import { AuthenticateDeviceKeyUseCase } from '../features/device-keys/usecases/authenticate-device-key.usecase';
import { DeviceKeyAuthGuard } from '../nest/device-key-auth.guard';
import { PostgresInviteRepository } from './persistence/postgres-invite.repository';
import { PostgresRbacRepository } from './persistence/postgres-rbac.repository';
import { PostgresSessionRepository } from './persistence/postgres-session.repository';
import { PostgresUserRepository } from './persistence/postgres-user.repository';
import { AuthorizationService } from './security/authorization.service';
import { BearerAuthGuard } from '../nest/bearer-auth.guard';
import { PostgresSigningKeyRepository } from './security/postgres-signing-key.repository';
import { SigningKeyService } from './security/signing-key.service';

/**
 * Adaptador temporário do Nest: expõe ao container as instâncias que o
 * composition root já criou, para que as rotas em coexistência usem exatamente
 * o mesmo banco, repositórios e serviços de segurança do servidor Fastify.
 */
@Module({})
export class AuthCoreModule {
  static forRoot(env: RuntimeEnv, core: AuthCore): DynamicModule {
    const providers = [
      { provide: RUNTIME_ENV, useValue: env },
      { provide: AUTH_DATABASE, useValue: core.database },
      { provide: Clock, useValue: core.clock },
      { provide: SecretGenerator, useValue: core.secrets },
      { provide: ScryptPasswordHasher, useValue: core.passwordHasher },
      { provide: HttpPwnedPasswordsGateway, useValue: core.pwnedPasswords },
      { provide: PreparePassword, useValue: core.preparePassword },
      { provide: PostgresDeviceKeyRepository, useValue: core.deviceKeyRepository },
      { provide: AuthenticateDeviceKeyUseCase, useValue: core.authenticateDeviceKey },
      { provide: PostgresInviteRepository, useValue: core.inviteRepository },
      { provide: PostgresRbacRepository, useValue: core.rbacRepository },
      { provide: PostgresUserRepository, useValue: core.userRepository },
      { provide: PostgresSessionRepository, useValue: core.sessionRepository },
      { provide: PostgresSigningKeyRepository, useValue: core.signingKeyRepository },
      { provide: SigningKeyService, useValue: core.signingKeyService },
      { provide: AuthorizationService, useValue: core.authorizationService },
      { provide: DeviceKeyAuthGuard, useClass: DeviceKeyAuthGuard },
      { provide: BearerAuthGuard, useClass: BearerAuthGuard },
    ];

    return {
      global: true,
      module: AuthCoreModule,
      providers,
      exports: [
        RUNTIME_ENV,
        AUTH_DATABASE,
        Clock,
        SecretGenerator,
        ScryptPasswordHasher,
        HttpPwnedPasswordsGateway,
        PreparePassword,
        PostgresDeviceKeyRepository,
        AuthenticateDeviceKeyUseCase,
        PostgresInviteRepository,
        PostgresRbacRepository,
        PostgresSessionRepository,
        PostgresUserRepository,
        PostgresSigningKeyRepository,
        SigningKeyService,
        AuthorizationService,
        DeviceKeyAuthGuard,
        BearerAuthGuard,
      ],
    };
  }
}
