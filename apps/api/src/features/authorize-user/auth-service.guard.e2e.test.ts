import "reflect-metadata";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Controller, Get, Module, UseGuards, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { DomainExceptionFilter } from "../../common/domain-exception.filter";
import { AuthServiceGuard } from "./auth-service.guard";
import type { AuthenticatedUser } from "../authenticate-user/authenticated-user";
import { CurrentUser } from "../authenticate-user/current-user.decorator";
import { AccessResource } from "./access-resource.decorator";

/**
 * O caminho inteiro por HTTP: um request chega a uma rota Nest de verdade,
 * protegida pelo `@UseGuards(AuthServiceGuard)` como os controllers, e o guard
 * fala por rede com um apps/auth falso que responde POST /auth/internal/authorize. Sem mocks de
 * fetch — e o que pega o Nest nao conseguir instanciar o guard, o header nao
 * ser repassado ou um status do apps/auth ser traduzido errado.
 */

@Controller("probe")
@AccessResource("event")
class ProbeController {
  @Get()
  @UseGuards(AuthServiceGuard)
  whoami(@CurrentUser() actor: AuthenticatedUser) {
    return { userId: actor.userId };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

let authStatus = 200;
let seenAuthorization: string | undefined;
let fakeAuth: Server;
let app: INestApplication;
let apiUrl: string;

beforeAll(async () => {
  fakeAuth = createServer((request, response) => {
    seenAuthorization = request.headers.authorization;
    if (request.url !== "/auth/internal/authorize" || request.method !== "POST" || request.headers["x-auth-service-key"] !== "test-internal-service-key-32-bytes") return void response.writeHead(404).end();
    if (authStatus !== 200) return void response.writeHead(authStatus).end();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ userId: "auth-user-1", email: null, name: "Ana", sessionId: "s1", roles: ["member"], permissions: [], denies: [] }));
  });
  await new Promise<void>((resolve) => fakeAuth.listen(0, "127.0.0.1", resolve));
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(fakeAuth.address() as AddressInfo).port}`;
  process.env.AUTH_INTERNAL_SERVICE_KEY = "test-internal-service-key-32-bytes";

  app = await NestFactory.create(ProbeModule, { logger: false });
  app.useGlobalFilters(new DomainExceptionFilter({ log() {}, error() {}, warn() {} }));
  await app.listen(0, "127.0.0.1");
  apiUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await new Promise((resolve) => fakeAuth?.close(resolve));
  delete process.env.AUTH_SERVICE_URL;
  delete process.env.AUTH_INTERNAL_SERVICE_KEY;
});

beforeEach(() => {
  authStatus = 200;
  seenAuthorization = undefined;
});

function probe(authorization?: string) {
  return fetch(`${apiUrl}/probe`, { headers: authorization ? { authorization } : {} });
}

test("a bearer accepted by apps/auth reaches the route with the resolved actor", async () => {
  const response = await probe("Bearer access-token");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ userId: "auth-user-1" });
  expect(seenAuthorization).toBe("Bearer access-token");
});

test("without a bearer the API answers 401 and apps/auth is never asked", async () => {
  const response = await probe();

  expect(response.status).toBe(401);
  expect(seenAuthorization).toBeUndefined();
});

test.each([
  [401, 401],
  [403, 403],
  [500, 503],
])("apps/auth answering %i becomes %i", async (fromAuth, expected) => {
  authStatus = fromAuth;

  expect((await probe("Bearer access-token")).status).toBe(expected);
});
