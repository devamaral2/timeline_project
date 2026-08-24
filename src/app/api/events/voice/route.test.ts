import { afterEach, expect, test, vi } from "vitest";

const controller = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("@/models/events/infra/factories/make-create-event-from-transcript-controller", () => ({
  makeCreateEventFromTranscriptController: () => controller,
}));

import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

test("POST /api/events/voice forwards the request to the transcript controller", async () => {
  const request = new Request("http://localhost/api/events/voice", {
    method: "POST",
    body: JSON.stringify({ transcript: "comecei a estudar ingles" }),
  });
  controller.handle.mockResolvedValue(
    Response.json({ eventId: "event-1", type: "routine" }, { status: 201 }),
  );

  const response = await POST(request);

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ eventId: "event-1", type: "routine" });
  expect(controller.handle).toHaveBeenCalledWith(request);
});
