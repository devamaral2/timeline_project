import { afterEach, expect, test, vi } from "vitest";

const controller = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("@/models/events/infra/factories/make-update-event-controller", () => ({
  makeUpdateEventController: () => controller,
}));

import { PATCH } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

test("PATCH /api/events/:eventId forwards request and route params to the update-event controller", async () => {
  const request = new Request("http://localhost/api/events/event-1", {
    method: "PATCH",
    body: JSON.stringify({ type: "sleep", userId: "attacker-1" }),
  });
  const context = { params: Promise.resolve({ eventId: "event-1" }) };
  controller.handle.mockResolvedValue(new Response(null, { status: 204 }));

  const response = await PATCH(request, context);

  expect(response.status).toBe(204);
  expect(controller.handle).toHaveBeenCalledWith(request, context);
});
