import type { LoginWithPasswordRouteDependencies } from "../features/login-with-password/http/login-with-password.routes";
import { loginWithPasswordRoutes } from "../features/login-with-password/http/login-with-password.routes";
import type { RefreshTokenRouteDependencies } from "../features/refresh-token/http/refresh-token.routes";
import { refreshTokenRoutes } from "../features/refresh-token/http/refresh-token.routes";
import type { LogoutRouteDependencies } from "../features/logout/http/logout.routes";
import { logoutRoutes } from "../features/logout/http/logout.routes";
import type { LogoutAllRouteDependencies } from "../features/logout-all/http/logout-all.routes";
import { logoutAllRoutes } from "../features/logout-all/http/logout-all.routes";
import type { CurrentUserRouteDependencies } from "../features/current-user/http/current-user.routes";
import { currentUserRoutes } from "../features/current-user/http/current-user.routes";
import type { InspectInviteRouteDependencies } from "../features/inspect-invite/http/inspect-invite.routes";
import { inspectInviteRoutes } from "../features/inspect-invite/http/inspect-invite.routes";
import type { AcceptInviteRouteDependencies } from "../features/accept-invite/http/accept-invite.routes";
import { acceptInviteRoutes } from "../features/accept-invite/http/accept-invite.routes";
import type { CreateInviteRouteDependencies } from "../features/create-invite/http/create-invite.routes";
import { createInviteRoutes } from "../features/create-invite/http/create-invite.routes";
import type { AuthRoute } from "./routes";

/** As dependências das operações de feature já migradas para o Fastify. */
export type AuthFeatureDependencies = LoginWithPasswordRouteDependencies &
  RefreshTokenRouteDependencies &
  LogoutRouteDependencies &
  LogoutAllRouteDependencies &
  CurrentUserRouteDependencies &
  InspectInviteRouteDependencies &
  AcceptInviteRouteDependencies &
  CreateInviteRouteDependencies;

/**
 * A tabela das rotas de feature, montada a partir das declarações de cada
 * feature. O proxy e a chave de dispositivo têm escopo próprio no servidor
 * Fastify (`proxy.routes.ts`).
 */
export function authFeatureRoutes(dependencies: AuthFeatureDependencies): AuthRoute[] {
  return [
    ...loginWithPasswordRoutes(dependencies),
    ...refreshTokenRoutes(dependencies),
    ...logoutRoutes(dependencies),
    ...logoutAllRoutes(dependencies),
    ...currentUserRoutes(dependencies),
    ...inspectInviteRoutes(dependencies),
    ...acceptInviteRoutes(dependencies),
    ...createInviteRoutes(dependencies),
  ];
}
