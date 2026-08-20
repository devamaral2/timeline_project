import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";

const execute = vi.fn();

vi.mock("@/models/events/infra/factories/make-list-timeline-events-usecase", () => ({
  makeListTimelineEventsUseCase: () => ({ execute }),
}));

vi.mock("@/components/layout/TimelineHeader", () => ({
  TimelineHeader: ({ userId }: { userId: string }) => <p>Timeline de {userId}</p>,
}));

const { default: UserTimelinePage } = await import("./page");

const event: TimelineEventCardDto = {
  id: "event-1",
  type: "food",
  accentColor: "orange",
  iconName: "utensils",
  name: "Café da manhã",
  description: "",
  startedAt: "2026-08-19T08:30:00-03:00",
  finishedAt: "2026-08-19T08:50:00-03:00",
  durationLabel: "20m",
  tags: [],
  interruptions: [],
};

beforeEach(() => {
  execute.mockReset();
});

test("renders the timeline of the requested user", async () => {
  execute.mockResolvedValue([event]);

  render(await UserTimelinePage({ params: Promise.resolve({ userId: "user-1" }) }));

  expect(screen.getByText("Timeline de user-1")).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 3, name: "Café da manhã" })).toHaveLength(2);
});

test("asks the use case only for the first eight day window of that user", async () => {
  execute.mockResolvedValue([]);

  await UserTimelinePage({ params: Promise.resolve({ userId: "user-42" }) });

  const input = execute.mock.calls[0]?.[0];
  expect(input.userId).toBe("user-42");
  expect(new Date(input.to).getTime() - new Date(input.from).getTime()).toBe(
    8 * 24 * 60 * 60 * 1000 - 1,
  );
});
