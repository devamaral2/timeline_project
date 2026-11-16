import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { expect, test, vi } from "vitest";
import { JobsService } from "../../infrastructure/jobs/jobs.service";
import { DATABASE } from "../../infrastructure/persistence";
import { ApiCoreModule } from "../api-core.module";
import { RequestOperations } from "./request-operations";

test("todos os modulos de funcionalidade compartilham um so registro de handlers da fila", async () => {
  expect(ApiCoreModule.forRoot()).toBe(ApiCoreModule.forRoot());
  const register = vi.fn();
  const module = await Test.createTestingModule({ imports: [ApiCoreModule.forRoot()] })
    .overrideProvider(DATABASE).useValue({ db: {}, pool: {} })
    .overrideProvider(JobsService).useValue({ register })
    .compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.init();
    expect(app.get(RequestOperations)).toBeInstanceOf(RequestOperations);
    expect(register.mock.calls.map(([kind]) => kind).sort()).toEqual([
      "food-generation", "hermes-turn", "request-dispatch", "request-edit-target", "request-fallback",
      "request-finalize", "request-step", "voice-task",
    ]);
  } finally {
    await app.close();
  }
});
