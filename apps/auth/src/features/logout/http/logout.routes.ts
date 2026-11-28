import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import type { AuthRoute } from "../../../server/routes";
import type { LogoutUseCase } from "../usecases/logout.usecase";

export interface LogoutRouteDependencies {
  readonly logout: Pick<LogoutUseCase, "execute">;
}

const refreshTokenBody = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();

/** Revoga pelo refresh token e responde 204 mesmo na repetição. */
export function logoutRoutes(dependencies: LogoutRouteDependencies): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/logout",
      status: 204,
      handler: async (request) => {
        const value = parseRequest(refreshTokenBody, request.body);
        await dependencies.logout.execute({
          refreshToken: value.refreshToken,
          context: request.authContext,
        });
      },
    },
  ];
}
