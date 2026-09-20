import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createTestUserForFile } from "../../../infrastructure/persistence/testing/test-user";
import { createPostgresTestContext, type PostgresTestContext } from "../../../infrastructure/persistence/testing/postgres-test-context";
import { DATABASE } from "../../../infrastructure/persistence/persistence.module";
import { EventsModule } from "../events.module";
import { OpenRouterMealParsingGateway } from "../gateways/openrouter-meal-parsing.gateway";
import { OpenRouterEventCommandParsingGateway } from "../gateways/openrouter-event-command-parsing.gateway";
import { EventsController } from "./events.controller";
import { ListTimelineEventsUseCase } from "../usecases/list-timeline-events.usecase";
import { CreateEventUseCase } from "../usecases/create-event.usecase";
import { GetDailyOverviewUseCase } from "../usecases/get-daily-overview.usecase";
import { CreateEventFromTranscriptUseCase } from "../usecases/create-event-from-transcript.usecase";
import { GetEventUseCase } from "../usecases/get-event.usecase";
import { UpdateEventUseCase } from "../usecases/update-event.usecase";
import { DeleteEventUseCase } from "../usecases/delete-event.usecase";
import { DomainExceptionFilter } from "../../../common/domain-exception.filter";

const owner = createTestUserForFile(__filename);
const other = createTestUserForFile(__filename);
const gatewayKey = "test-internal-service-key-32-bytes";

describe("events HTTP flow", () => {
  let ctx: PostgresTestContext;
  let app: INestApplication;
  let base: string;
  let previousGatewayKey: string | undefined;
  const mealGateway = { parseMeal: vi.fn(() => { throw new Error("Unexpected external meal request"); }) };
  const commandGateway = { parseCommand: vi.fn(() => { throw new Error("Unexpected external command request"); }) };

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    previousGatewayKey = process.env.AUTH_INTERNAL_SERVICE_KEY;
    process.env.AUTH_INTERNAL_SERVICE_KEY = gatewayKey;
    Reflect.defineMetadata("design:paramtypes", [
      ListTimelineEventsUseCase, CreateEventUseCase, GetDailyOverviewUseCase,
      CreateEventFromTranscriptUseCase, GetEventUseCase, UpdateEventUseCase,
      DeleteEventUseCase,
    ], EventsController);
    const module = await Test.createTestingModule({ imports: [EventsModule] })
      .overrideProvider(DATABASE)
      .useValue({ db: ctx.db, pool: ctx.pool })
      .overrideProvider(OpenRouterMealParsingGateway)
      .useValue(mealGateway)
      .overrideProvider(OpenRouterEventCommandParsingGateway)
      .useValue(commandGateway)
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter({ log() {}, warn() {}, error() {} }));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
    await ctx?.stop();
    if (previousGatewayKey === undefined) delete process.env.AUTH_INTERNAL_SERVICE_KEY;
    else process.env.AUTH_INTERNAL_SERVICE_KEY = previousGatewayKey;
  });

  function headers(userId: string): Record<string, string> {
    return { "content-type": "application/json", "x-auth-gateway-key": gatewayKey, "x-auth-user-id": userId };
  }

  test("rejects requests without the internal gateway identity", async () => {
    const result = await fetch(`${base}/api/events`);
    expect(result.status).toBe(401);
    expect(mealGateway.parseMeal).not.toHaveBeenCalled();
    expect(commandGateway.parseCommand).not.toHaveBeenCalled();
  });

  test("creates, persists and reads only the owner's event", async () => {
    const created = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: headers(owner.id),
      body: JSON.stringify({ name: "Planejamento", items: [{ type: "routine" }] }),
    });
    expect(created.status).toBe(201);
    const { eventId } = await created.json() as { eventId: string };
    const row = await ctx.pool.query("SELECT user_id, name FROM events WHERE id=$1", [eventId]);
    expect(row.rows).toEqual([{ user_id: owner.id, name: "Planejamento" }]);

    const own = await fetch(`${base}/api/events/${eventId}`, { headers: headers(owner.id) });
    expect(own.status).toBe(200);
    const foreign = await fetch(`${base}/api/events/${eventId}`, { headers: headers(other.id) });
    expect(foreign.status).toBe(403);
    expect(mealGateway.parseMeal).not.toHaveBeenCalled();
    expect(commandGateway.parseCommand).not.toHaveBeenCalled();
  });
});
