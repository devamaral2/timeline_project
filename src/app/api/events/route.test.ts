import { afterEach, expect, test, vi } from "vitest";

const controller = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("@/models/events/infra/factories/make-create-event-controller", () => ({
  makeCreateEventController: () => controller,
}));

import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

test("POST /api/events forwards the request to the create-event controller", async () => {
  const request = new Request("http://localhost/api/events", {
    method: "POST",
    body: JSON.stringify({ type: "sleep", userId: "attacker-1" }),
  });
  controller.handle.mockResolvedValue(Response.json({ eventId: "event-1" }, { status: 201 }));

  const response = await POST(request);

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ eventId: "event-1" });
  expect(controller.handle).toHaveBeenCalledWith(request);
});
