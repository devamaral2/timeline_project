import "reflect-metadata";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { ListTimelineEventsController } from "./list-timeline-events.controller";
import { GetDailyOverviewController } from "../get-daily-overview/get-daily-overview.controller";
import { CreateEventFromTranscriptController } from "../create-event-from-transcript/create-event-from-transcript.controller";
import { GetEventController } from "../get-event/get-event.controller";

/** Caminho declarado em cada handler, na ordem em que os metodos aparecem na classe. */
function methodPath(controller: object): string {
  return Reflect.getMetadata(PATH_METADATA, (controller as { prototype: Record<string, object> }).prototype.execute);
}

/**
 * O Nest casa rotas na ordem de declaracao. Se `:eventId` for declarado antes de
 * `daily` ou `voice`, o parametro dinamico captura as duas e elas passam a
 * responder um GetEvent com eventId="daily". O roteamento por arquivo do Next
 * escondia esse risco; aqui ele fica travado.
 */
test("declares the static event routes before the dynamic :eventId route", () => {
  expect(methodPath(GetDailyOverviewController)).toBe("daily");
  expect(methodPath(CreateEventFromTranscriptController)).toBe("voice");
  expect(methodPath(GetEventController)).toBe(":eventId");
});

/**
 * Leituras publicas ficaram para tras: timeline e daily overview agora exigem
 * o ator resolvido pelo apps/auth, como o resto das rotas.
 */
test.each(["list", "daily"])("requires GatewayIdentityGuard on %s", (methodName) => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    (methodName === "list" ? ListTimelineEventsController : GetDailyOverviewController).prototype.execute,
  ) as unknown[] | undefined;

  expect(guards).toContain(GatewayIdentityGuard);
});
