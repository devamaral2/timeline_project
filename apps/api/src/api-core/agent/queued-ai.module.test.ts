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
      "hermes-turn", "meal-note", "process-agent-skill-note-edit", "process-dispatch", "process-edit-target",
      "process-event-create", "process-event-edit", "process-fallback", "process-finalize", "process-food-note-edit",
      "process-note-create", "process-note-edit", "process-query", "process-recurring-event-create",
      "process-recurring-event-edit", "process-recurring-task-create", "process-recurring-task-edit",
      "process-sleep-note-edit", "process-task-create", "process-task-edit", "process-training-edit",
      "transcript-event",
    ]);
  } finally {
    await app.close();
  }
});
