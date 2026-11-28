import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { SaveDailyReadingUseCase } from "./save-daily-reading.usecase";
import { saveDailyReadingRoute } from "./save-daily-reading.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };

const page = {
  url: "https://example.com/uma-pagina",
  title: "Uma página",
  markdown: "# Uma página\n\ntexto",
};

function setup(result = { taskId: "t1", artifactId: "a1", taskCreated: true, artifactCreated: true }) {
  const execute = vi.fn(async () => result);
  const app = createFastifyInstance();
  registerApiRoutes(app, [saveDailyReadingRoute({ execute } as unknown as SaveDailyReadingUseCase)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
    logger: { warn() {}, error() {} },
  });
  return { app, execute };
}

async function post(app: ReturnType<typeof setup>["app"], body: unknown) {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks/daily-reading",
    headers: { ...session, "content-type": "application/json" },
    payload: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("POST /api/tasks/daily-reading entrega a página e a identidade ao caso de uso", async () => {
  const { app, execute } = setup();

  const response = await post(app, page);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ taskId: "t1", artifactId: "a1", taskCreated: true, artifactCreated: true });
  expect(execute).toHaveBeenCalledWith(page, { userId: "owner-1" });
  await app.close();
});

test.each([
  ["sem url", { title: "Uma página", markdown: "texto" }],
  ["url que não é http", { ...page, url: "javascript:alert(1)" }],
  ["sem markdown", { url: page.url, title: page.title, markdown: "   " }],
  ["campo desconhecido", { ...page, extra: true }],
])("recusa o corpo %s com 400 sem chamar o caso de uso", async (_case, body) => {
  const { app, execute } = setup();

  const response = await post(app, body);

  expect(response.status).toBe(400);
  expect(typeof (response.body as { error: string }).error).toBe("string");
  expect(execute).not.toHaveBeenCalled();
  await app.close();
});

test("o corpo enviado pela extensão continua aceito acima dos 100 kB", async () => {
  const { app, execute } = setup();

  const response = await post(app, { ...page, markdown: "a".repeat(300_000) });

  expect(response.status).toBe(200);
  expect(execute).toHaveBeenCalledOnce();
  await app.close();
});
