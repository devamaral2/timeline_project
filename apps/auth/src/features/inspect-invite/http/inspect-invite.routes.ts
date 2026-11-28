import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import type { AuthRoute } from "../../../server/routes";
import type { InspectInviteUseCase } from "../usecases/inspect-invite.usecase";

export interface InspectInviteRouteDependencies {
  readonly inspectInvite: Pick<InspectInviteUseCase, "execute">;
}

const inspectBody = z.object({ token: z.string().min(1) }).strict();

/** Inspeciona um convite antes do cadastro; POST responde 201. */
export function inspectInviteRoutes(dependencies: InspectInviteRouteDependencies): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/invites/inspect",
      status: 201,
      handler: async (request) => {
        const value = parseRequest(inspectBody, request.body);
        return dependencies.inspectInvite.execute(value.token);
      },
    },
  ];
}
