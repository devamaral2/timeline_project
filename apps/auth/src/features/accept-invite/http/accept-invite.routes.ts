import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import type { AuthRoute } from "../../../server/routes";
import type { AcceptInviteUseCase } from "../usecases/accept-invite.usecase";

export interface AcceptInviteRouteDependencies {
  readonly acceptInvite: Pick<AcceptInviteUseCase, "execute">;
}

const acceptBody = z
  .object({ token: z.string().min(1).max(1024), password: z.string().min(1).max(1024) })
  .strict();

/** Aceita o convite e define a senha; POST responde 201. */
export function acceptInviteRoutes(dependencies: AcceptInviteRouteDependencies): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/invites/accept",
      status: 201,
      handler: async (request) => {
        const value = parseRequest(acceptBody, request.body);
        return dependencies.acceptInvite.execute({
          inviteToken: value.token,
          password: value.password,
          context: request.authContext,
        });
      },
    },
  ];
}
