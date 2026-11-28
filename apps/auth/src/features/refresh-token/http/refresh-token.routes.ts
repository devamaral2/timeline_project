import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import type { AuthRoute } from "../../../server/routes";
import type { RefreshTokenUseCase } from "../usecases/refresh-token.usecase";

export interface RefreshTokenRouteDependencies {
  readonly refresh: Pick<RefreshTokenUseCase, "execute">;
}

const refreshTokenBody = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();

/** Troca o refresh token consumindo-o; responde 200 com o novo par. */
export function refreshTokenRoutes(dependencies: RefreshTokenRouteDependencies): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/token/refresh",
      status: 200,
      handler: async (request) => {
        const value = parseRequest(refreshTokenBody, request.body);
        const result = await dependencies.refresh.execute({
          refreshToken: value.refreshToken,
          context: request.authContext,
        });
        return { accessToken: result.accessToken, refreshToken: result.refreshToken };
      },
    },
  ];
}
