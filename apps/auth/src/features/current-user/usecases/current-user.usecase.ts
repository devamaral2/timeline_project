import type { AuthenticatedActor } from "../../../domain/users/user";
import { AuthorizationService, type CurrentUserResult } from "../../../auth-core/security/authorization.service";

export type Me = CurrentUserResult;

/**
 * Releem usuario e sessao a partir do banco — o bearer prova identidade no
 * instante em que foi assinado, nao que a sessao ou o usuario continuam
 * ativos agora.
 */
export class CurrentUserUseCase {
  constructor(private readonly authorization: AuthorizationService) {}

  async execute(actor: AuthenticatedActor): Promise<Me> {
    return this.authorization.currentUser(actor);
  }
}
