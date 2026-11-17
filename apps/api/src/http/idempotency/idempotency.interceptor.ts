import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { catchError, from, map, mergeMap, of, throwError, type Observable } from "rxjs";
import type { IdempotencyKeyRef, IdempotencyStore } from "../../domain/ports";
import { IDEMPOTENCY_STORE } from "../../infrastructure/persistence";
import type { GatewayRequest } from "../request-identity/gateway-identity.guard";

/** Rotas de criacao que aceitam `Idempotency-Key`. Nas demais o header e ignorado. */
export const IDEMPOTENT_ROUTES: ReadonlySet<string> = new Set([
  "/api/tasks",
  "/api/artifacts",
  "/api/recurrences",
]);

export const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Header opcional `Idempotency-Key` nas rotas de criacao. Sem ele nada muda (a
 * web e o mobile seguem como antes). Com ele, repetir a chave devolve a resposta
 * da primeira execucao com o header `Idempotent-Replayed: true`, sem criar outra
 * entidade; a mesma chave com outro corpo e 422 e uma execucao simultanea e 409.
 *
 * Roda depois do guard, entao o ator ja esta resolvido: a chave vale por usuario.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<GatewayRequest>();
    const key = request.header("idempotency-key");
    const scope = request.route?.path as string | undefined;
    if (!key || request.method !== "POST" || !scope || !IDEMPOTENT_ROUTES.has(scope) || !request.actor) {
      return next.handle();
    }
    if (!IDEMPOTENCY_KEY_FORMAT.test(key)) throw new BadRequestException("Invalid Idempotency-Key");

    const ref: IdempotencyKeyRef = { userId: request.actor.userId, scope, key };
    const requestHash = createHash("sha256").update(JSON.stringify(request.body ?? null)).digest("hex");
    const response = http.getResponse<Response>();

    return from(this.store.claim({ ...ref, requestHash })).pipe(
      mergeMap((claim): Observable<unknown> => {
        switch (claim.kind) {
          case "replay":
            response.setHeader("Idempotent-Replayed", "true");
            return of(claim.response);
          case "in_progress":
            return throwError(() => new ConflictException("A request with this Idempotency-Key is in progress"));
          case "mismatch":
            return throwError(
              () => new UnprocessableEntityException("Idempotency-Key was already used with a different request"),
            );
          case "claimed":
            return next.handle().pipe(
              catchError((error: unknown) =>
                from(this.store.release(ref).catch(() => undefined)).pipe(mergeMap(() => throwError(() => error))),
              ),
              mergeMap((result) => from(this.store.complete({ ...ref, response: result })).pipe(map(() => result))),
            );
        }
      }),
    );
  }
}
