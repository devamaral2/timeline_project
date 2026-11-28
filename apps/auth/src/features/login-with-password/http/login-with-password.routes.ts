import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import type { AuthRoute } from "../../../server/routes";
import type { LoginWithPasswordUseCase } from "../usecases/login-with-password.usecase";

export interface LoginWithPasswordRouteDependencies {
  readonly loginWithPassword: Pick<LoginWithPasswordUseCase, "execute">;
}

const loginBody = z
  .object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) })
  .strict();

/** Login por email e senha emite a sessão; POST responde 201. */
export function loginWithPasswordRoutes(
  dependencies: LoginWithPasswordRouteDependencies,
): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/login",
      status: 201,
      handler: async (request) => {
        const value = parseRequest(loginBody, request.body);
        return dependencies.loginWithPassword.execute({
          ...value,
          context: request.authContext,
        });
      },
    },
  ];
}
