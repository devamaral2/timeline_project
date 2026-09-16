import { expect, test } from "vitest";
import type { TimelineEventCardDto } from "@/lib/api/contracts";
import { agendaEventFromCard, agendaEventsByDay } from "./agenda-data";

function card(overrides: Partial<TimelineEventCardDto> = {}): TimelineEventCardDto {
  return {
    id: "event-1",
    primaryItemId: "item-1",
    primaryItemType: "routine",
    itemTypes: ["routine"],
    missed: false,
    name: "Planejar o dia",
    description: "",
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: "2026-09-14T12:30:00.000Z",
    durationLabel: "30m",
    tags: ["pessoal"],
    interruptions: [],
    ...overrides,
  };
}

test("maps a real card to the visual event model", () => {
  expect(agendaEventFromCard(card())).toMatchObject({
    id: "event-1",
    time: "09:00 — 09:30",
    minutes: 30,
    tags: ["pessoal"],
    running: false,
  });
});

test("keeps running cards without inventing a duration and sorts each day", () => {
  const grouped = agendaEventsByDay([
    card({ id: "late", startedAt: "2026-09-14T15:00:00.000Z" }),
    card({ id: "early", startedAt: "2026-09-14T12:00:00.000Z", finishedAt: undefined, durationLabel: "--" }),
  ]);

  expect(grouped["2026-09-14"]?.map((event) => event.id)).toEqual(["early", "late"]);
  expect(grouped["2026-09-14"]?.[0]).toMatchObject({ running: true, minutes: 0, time: "09:00 — em andamento" });
});

test("deduplicates cards returned by adjacent pages", () => {
  const event = card({ id: "same" });
  expect(agendaEventsByDay([event, event])["2026-09-14"]).toHaveLength(1);
});
