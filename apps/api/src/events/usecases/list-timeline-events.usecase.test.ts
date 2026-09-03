import { expect, test } from "vitest";
import { Event, EventItem } from "@repo/entities";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryTimelineEventQuery } from "../testing/in-memory-timeline-event.query";
import { ListTimelineEventsUseCase } from "./list-timeline-events.usecase";

function aRoutineEvent(props: {
  id: string;
  startedAt: string;
  finishedAt?: string;
  missed?: boolean;
}) {
  return Event.create({
    id: props.id,
    userId: "user-1",
    name: "Bloco de trabalho",
    description: "",
    startedAt: new Date(props.startedAt),
    finishedAt: props.finishedAt ? new Date(props.finishedAt) : undefined,
    tags: [],
    interruptions: [],
    items: [EventItem.create({ position: 0, type: "routine", schemaVersion: 1, isPrimary: true, data: {} })],
    missed: props.missed,
  });
}

async function marksOf(events: Event[]) {
  const useCase = new ListTimelineEventsUseCase(new InMemoryTimelineEventQuery(new InMemoryEventDatabase(events)));
  const page = await useCase.execute({}, { userId: "user-1" });
  return new Map(page.items.map((card) => [card.id, card.missed]));
}

test("sends every card with the mark the user made, and nothing else about it", async () => {
  const marks = await marksOf([
    aRoutineEvent({
      id: "done",
      startedAt: "2026-08-19T09:00:00.000Z",
      finishedAt: "2026-08-19T11:00:00.000Z",
    }),
    aRoutineEvent({ id: "open", startedAt: "2026-08-19T14:00:00.000Z" }),
    aRoutineEvent({
      id: "skipped",
      startedAt: "2026-08-19T13:00:00.000Z",
      missed: true,
    }),
  ]);

  expect(marks.get("done")).toBe(false);
  expect(marks.get("open")).toBe(false);
  expect(marks.get("skipped")).toBe(true);
});

test("never marks an event the clock left behind", async () => {
  // Nao ha hora que ligue a marca sozinha: um evento antigo que ninguem anotou
  // continua sem anotacao, hoje e daqui a um ano.
  const marks = await marksOf([
    aRoutineEvent({
      id: "long-gone",
      startedAt: "2020-01-01T09:00:00.000Z",
      finishedAt: "2020-01-01T10:00:00.000Z",
    }),
  ]);

  expect(marks.get("long-gone")).toBe(false);
});

test("lists every closed event whose interval intersects the selected day", async () => {
  const useCase = new ListTimelineEventsUseCase(
    new InMemoryTimelineEventQuery(
      new InMemoryEventDatabase([
        aRoutineEvent({
          id: "starts-in-day",
          startedAt: "2026-08-27T10:00:00.000Z",
          finishedAt: "2026-08-27T11:00:00.000Z",
        }),
        aRoutineEvent({
          id: "ends-in-day",
          startedAt: "2026-08-26T23:00:00.000Z",
          finishedAt: "2026-08-27T04:00:00.000Z",
        }),
        aRoutineEvent({
          id: "covers-whole-day",
          startedAt: "2026-08-26T02:00:00.000Z",
          finishedAt: "2026-08-28T04:00:00.000Z",
        }),
        aRoutineEvent({
          id: "ended-before",
          startedAt: "2026-08-26T02:00:00.000Z",
          finishedAt: "2026-08-27T02:59:59.999Z",
        }),
        aRoutineEvent({
          id: "starts-after",
          startedAt: "2026-08-28T03:00:00.000Z",
          finishedAt: "2026-08-28T04:00:00.000Z",
        }),
        aRoutineEvent({
          id: "open-from-previous-day",
          startedAt: "2026-08-26T10:00:00.000Z",
        }),
      ]),
    ),
  );

  const page = await useCase.execute(
    { from: "2026-08-27T03:00:00.000Z", to: "2026-08-28T02:59:59.999Z" },
    { userId: "user-1" },
  );

  expect(page.items.map((card) => card.id).sort()).toEqual([
    "covers-whole-day",
    "ends-in-day",
    "starts-in-day",
  ]);
});
