import type { AuthRoute } from "../../../server/routes";
import { authenticatedActor } from "../../../server/guards";
import type { CurrentUserUseCase } from "../usecases/current-user.usecase";

export interface CurrentUserRouteDependencies {
  readonly currentUser: Pick<CurrentUserUseCase, "execute">;
}

/** Relê usuário, sessão e permissões no banco a partir do bearer. */
export function currentUserRoutes(dependencies: CurrentUserRouteDependencies): AuthRoute[] {
  return [
    {
      method: "GET",
      path: "/auth/me",
      status: 200,
      authentication: "bearer",
      handler: async (request) => dependencies.currentUser.execute(authenticatedActor(request)),
    },
  ];
}
