import type { INestApplication, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { PwnedPasswordsGateway } from "./auth-core/password/pwned-passwords.gateway";
import { HttpPwnedPasswordsGateway } from "./auth-core/password/http-pwned-passwords.gateway";
import { PreparePassword } from "./auth-core/password/prepare-password";
import { ScryptPasswordHasher } from "./auth-core/password/scrypt-password-hasher";
import type { AuthDatabase } from "./db/client";
import { createAuthDatabase } from "./db/client";
import type { DeviceKeyRepository } from "./auth-core/persistence/postgres-device-key.repository";
import { PostgresDeviceKeyRepository } from "./auth-core/persistence/postgres-device-key.repository";
import { PostgresInviteRepository } from "./auth-core/persistence/postgres-invite.repository";
import { PostgresRbacRepository } from "./auth-core/persistence/postgres-rbac.repository";
import { PostgresSessionRepository } from "./auth-core/persistence/postgres-session.repository";
import { PostgresUserRepository } from "./auth-core/persistence/postgres-user.repository";
import { AuthorizationService } from "./auth-core/security/authorization.service";
import { PostgresSigningKeyRepository } from "./auth-core/security/postgres-signing-key.repository";
import { SigningKeyService } from "./auth-core/security/signing-key.service";
import { Clock, SystemClock } from "./common/clock";
import { ConsoleAuthLogger, type AuthLogger } from "./common/logger";
import { CryptoSecretGenerator, type SecretGenerator } from "./common/secret-generator";
import type { RuntimeEnv } from "./config/env";
import { AppModule } from "./app.module";
import { ensureSigningKeyActive } from "./bootstrap/signing-key-startup";
import { AuthenticateDeviceKeyUseCase } from "./features/device-keys/usecases/authenticate-device-key.usecase";
import { LoginWithPasswordUseCase } from "./features/login-with-password/usecases/login-with-password.usecase";
import { LoginCredentialChecker } from "./features/login-with-password/services/login-credential-checker";
import { PostgresRateLimiter } from "./features/login-with-password/services/rate-limit/postgres-rate-limiter";
import { PostgresLoginRepository } from "./features/login-with-password/postgres-login.repository";
import { RefreshTokenUseCase } from "./features/refresh-token/usecases/refresh-token.usecase";
import { LogoutUseCase } from "./features/logout/usecases/logout.usecase";
import { LogoutAllUseCase } from "./features/logout-all/usecases/logout-all.usecase";
import { CurrentUserUseCase } from "./features/current-user/usecases/current-user.usecase";
import { InspectInviteUseCase } from "./features/inspect-invite/usecases/inspect-invite.usecase";
import { AcceptInviteUseCase } from "./features/accept-invite/usecases/accept-invite.usecase";
import { CreateInviteUseCase } from "./features/create-invite/usecases/create-invite.usecase";
import { ApiUpgradeProxy } from "./http/api-proxy/api-upgrade-proxy";
import { configureHttpShell } from "./nest/http-shell";
import { createAuthHttpServer, type AuthHttpServer } from "./server/auth-server";
import type { AuthRoute } from "./server/routes";

/**
 * O grafo explícito do Auth. Configuração, banco, repositórios, segurança e os
 * serviços de runtime nascem aqui, por constructor, uma única vez por processo.
 * Não há container, token de injeção nem reflection nesta montagem.
 */
export interface AuthCore {
  readonly env: RuntimeEnv;
  readonly database: AuthDatabase;
  readonly clock: Clock;
  readonly secrets: SecretGenerator;
  readonly passwordHasher: ScryptPasswordHasher;
  readonly pwnedPasswords: PwnedPasswordsGateway;
  readonly preparePassword: PreparePassword;
  readonly deviceKeyRepository: DeviceKeyRepository;
  readonly authenticateDeviceKey: AuthenticateDeviceKeyUseCase;
  readonly inviteRepository: PostgresInviteRepository;
  readonly rbacRepository: PostgresRbacRepository;
  readonly userRepository: PostgresUserRepository;
  readonly sessionRepository: PostgresSessionRepository;
  readonly signingKeyRepository: PostgresSigningKeyRepository;
  readonly signingKeyService: SigningKeyService;
  readonly authorizationService: AuthorizationService;
  readonly loginWithPassword: LoginWithPasswordUseCase;
  readonly refresh: RefreshTokenUseCase;
  readonly logout: LogoutUseCase;
  readonly logoutAll: LogoutAllUseCase;
  readonly currentUser: CurrentUserUseCase;
  readonly inspectInvite: InspectInviteUseCase;
  readonly acceptInvite: AcceptInviteUseCase;
  readonly createInvite: CreateInviteUseCase;
  close(): Promise<void>;
}

export interface AuthCoreOverrides {
  readonly pwnedPasswords?: PwnedPasswordsGateway;
  readonly deviceKeys?: DeviceKeyRepository;
}

export function composeAuthCore(env: RuntimeEnv, overrides: AuthCoreOverrides = {}): Promise<AuthCore> {
  const database = createAuthDatabase({ connectionString: env.databaseUrl });
  const clock = new SystemClock();
  const secrets = new CryptoSecretGenerator();
  const passwordHasher = new ScryptPasswordHasher();
  const pwnedPasswords =
    overrides.pwnedPasswords ?? new HttpPwnedPasswordsGateway(env.passwordBlocklistTimeoutMs);
  const preparePassword = new PreparePassword(pwnedPasswords, passwordHasher);

  const deviceKeyRepository = overrides.deviceKeys ?? new PostgresDeviceKeyRepository(database);
  const authenticateDeviceKey = new AuthenticateDeviceKeyUseCase(deviceKeyRepository, clock);
  const inviteRepository = new PostgresInviteRepository(database);
  const rbacRepository = new PostgresRbacRepository(database);
  const userRepository = new PostgresUserRepository(database);
  const sessionRepository = new PostgresSessionRepository(
    database,
    env.issuer,
    env.audience,
  );
  const signingKeyRepository = new PostgresSigningKeyRepository(database);
  const signingKeyService = new SigningKeyService(
    signingKeyRepository,
    env.keyEncryptionKey,
    secrets,
  );
  const authorizationService = new AuthorizationService(
    sessionRepository,
    userRepository,
    rbacRepository,
  );

  const loginRepository = new PostgresLoginRepository(database, env.issuer, env.audience);
  const rateLimiter = new PostgresRateLimiter(database, env.keyEncryptionKey);

  // O hash de comparação é calculado uma única vez por processo, como no antigo
  // provider do Nest: toda tentativa paga exatamente um KDF.
  return passwordHasher.hash("timeline-auth-login-dummy").then((dummyHash) => {
    const credentials = new LoginCredentialChecker(passwordHasher, dummyHash);
    const loginWithPassword = new LoginWithPasswordUseCase(
      userRepository,
      credentials,
      rateLimiter,
      loginRepository,
      clock,
      secrets,
      env.limits,
      signingKeyService.signAccessToken,
    );

    return Object.freeze({
      env,
      database,
      clock,
      secrets,
      passwordHasher,
      pwnedPasswords,
      preparePassword,
      deviceKeyRepository,
      authenticateDeviceKey,
      inviteRepository,
      rbacRepository,
      userRepository,
      sessionRepository,
      signingKeyRepository,
      signingKeyService,
      authorizationService,
      loginWithPassword,
      refresh: new RefreshTokenUseCase(
        sessionRepository,
        signingKeyService.signAccessToken,
        clock,
        secrets,
      ),
      logout: new LogoutUseCase(sessionRepository, clock),
      logoutAll: new LogoutAllUseCase(sessionRepository, clock),
      currentUser: new CurrentUserUseCase(authorizationService),
      inspectInvite: new InspectInviteUseCase(inviteRepository, clock),
      acceptInvite: new AcceptInviteUseCase(inviteRepository, preparePassword, clock),
      createInvite: new CreateInviteUseCase(
        inviteRepository,
        clock,
        secrets,
        env.webAppUrl,
      ),
      close: () => database.close(),
    });
  });
}

export interface StartAuthOptions {
  /** 0 pede uma porta efêmera, como nos testes HTTP reais. */
  readonly port?: number;
  readonly host?: string;
  /** A suíte de startup desliga a garantia para observar o estado sem chave. */
  readonly ensureSigningKey?: boolean;
  readonly overrides?: AuthCoreOverrides;
  readonly logger?: AuthLogger;
  /** Controllers só de teste (as sondas de contrato) viajam com o Nest temporário. */
  readonly controllers?: readonly Type<unknown>[];
  readonly routes?: readonly AuthRoute[];
}

export interface RunningAuth {
  readonly url: string;
  readonly core: AuthCore;
  readonly nestApp: INestApplication;
  readonly http: AuthHttpServer;
  close(): Promise<void>;
}

/**
 * A ordem do processo é parte do contrato operacional: composição, garantia da
 * chave de assinatura, inicialização do Nest em coexistência, listener de
 * upgrade, listen. O shutdown desfaz na ordem inversa.
 */
export async function startAuth(
  env: RuntimeEnv,
  options: StartAuthOptions = {},
): Promise<RunningAuth> {
  const core = await composeAuthCore(env, options.overrides);
  const logger = options.logger ?? new ConsoleAuthLogger();

  const http = createAuthHttpServer({
    dependencies: core,
    logger,
    routes: options.routes,
  });
  let nestApp: INestApplication | undefined;
  const upgradeProxy = new ApiUpgradeProxy(env.apiServiceUrl);
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    upgradeProxy.detach(http.server);
    try {
      await http.close();
    } finally {
      try {
        await nestApp?.close();
      } finally {
        await core.close();
      }
    }
  };

  try {
    if (options.ensureSigningKey !== false) {
      await ensureSigningKeyActive(core.signingKeyService);
    }

    nestApp = await NestFactory.create(
      AppModule.forRoot(env, core, { controllers: options.controllers }),
      { bodyParser: false, logger: false },
    );
    configureHttpShell(nestApp, logger);
    await nestApp.init();
    http.setFallback(nestApp.getHttpAdapter().getInstance());

    // O listener de upgrade é instalado antes do listen e removido no close,
    // fora dos hooks de lifecycle do Nest.
    upgradeProxy.attach(http.server);

    const url = await http.listen(options.port ?? env.port, options.host ?? env.host);
    return { url, core, nestApp, http, close };
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
}
