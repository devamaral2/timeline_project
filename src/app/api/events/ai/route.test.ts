import { afterEach, expect, test, vi } from "vitest";

const controller = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("@/models/events/infra/factories/make-create-event-from-text-controller", () => ({
  makeCreateEventFromTextController: () => controller,
}));

import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

test("POST /api/events/ai forwards the request to the create-event-from-text controller", async () => {
  const request = new Request("http://localhost/api/events/ai", {
    method: "POST",
    body: JSON.stringify({ text: "Corri 5 km, por uma hora e meia e queimei 300 calorias" }),
  });
  controller.handle.mockResolvedValue(
    Response.json(
      { eventIds: ["event-1"], skillsUsed: ["create_training_event"], modelName: "test/model" },
      { status: 201 },
    ),
  );

  const response = await POST(request);

  expect(response.status).toBe(201);
  expect((await response.json()).eventIds).toEqual(["event-1"]);
  expect(controller.handle).toHaveBeenCalledWith(request);
});
