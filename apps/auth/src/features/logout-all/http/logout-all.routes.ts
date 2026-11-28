import type { AuthRoute } from "../../../server/routes";
import { authenticatedActor } from "../../../server/guards";
import type { LogoutAllUseCase } from "../usecases/logout-all.usecase";

export interface LogoutAllRouteDependencies {
  readonly logoutAll: Pick<LogoutAllUseCase, "execute">;
}

/** Revoga todas as sessões do bearer válido e responde 204 vazio. */
export function logoutAllRoutes(dependencies: LogoutAllRouteDependencies): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/logout-all",
      status: 204,
      authentication: "bearer",
      handler: async (request) => {
        await dependencies.logoutAll.execute({
          actor: authenticatedActor(request),
          context: request.authContext,
        });
      },
    },
  ];
}
