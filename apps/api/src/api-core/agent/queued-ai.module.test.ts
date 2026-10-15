import "reflect-metadata";
import { expect, test, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { DATABASE } from "../../infrastructure/persistence";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { ApiCoreModule } from "../api-core.module";

test("all feature imports share one set of queue handlers", async () => {
  expect(ApiCoreModule.forRoot()).toBe(ApiCoreModule.forRoot());
  const register = vi.fn();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE).useValue({ db: {}, pool: {} })
    .overrideProvider(AiJobsService).useValue({ register })
    .compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.init();
    expect(register.mock.calls.map(([kind]) => kind).sort()).toEqual([
      "agent-turn", "meal-note", "transcript-event",
    ]);
  } finally {
    await app.close();
  }
});
