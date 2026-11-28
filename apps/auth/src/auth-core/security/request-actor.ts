import type { AuthenticatedActor } from "../../domain/users/user";

export interface ActorCarrier {
  actor?: AuthenticatedActor;
}

/** O ator validado, sem depender de como o transporte o guardou na request. */
export function actorOf(request: ActorCarrier): AuthenticatedActor | undefined {
  return request.actor;
}

export function setActor(request: ActorCarrier, actor: AuthenticatedActor): void {
  request.actor = actor;
}
