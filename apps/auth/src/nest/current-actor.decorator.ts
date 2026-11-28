import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedActor } from "../domain/users/user";
import { actorOf, type ActorCarrier } from "../auth-core/security/request-actor";

/** Adaptador temporario do Nest para `actorOf`, que nao depende de framework. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedActor | undefined =>
  actorOf(context.switchToHttp().getRequest<ActorCarrier>()),
);
