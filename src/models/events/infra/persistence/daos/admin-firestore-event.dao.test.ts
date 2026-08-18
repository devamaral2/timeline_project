import type { Firestore } from "firebase-admin/firestore";
import { expect, test } from "vitest";
import type { EventDocument } from "../repositories/mappers/event-document.mapper";
import { AdminFirestoreEventDao } from "./admin-firestore-event.dao";

const eventDocument: EventDocument = {
  id: "01K2R1J5M8S0Y2Z7ABCD123462",
  type: "routine",
  userId: "user-1",
  name: "Planning",
  description: "",
  startedAt: "2026-08-17T12:00:00.000Z",
  tags: [],
  interruptions: [],
  data: {},
  createdAt: "2026-08-17T12:00:00.000Z",
  updatedAt: "2026-08-17T12:00:00.000Z",
};

test("limits the latest user-event lookup to one document", async () => {
  let requestedLimit: number | undefined;
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: (value: number) => {
      requestedLimit = value;
      return query;
    },
    get: async () => ({ docs: [{ data: () => eventDocument }] }),
  };
  const database = { collection: () => query } as unknown as Firestore;

  const result = await new AdminFirestoreEventDao(database).findLatestOpenByUserId("user-1");

  expect(requestedLimit).toBe(1);
  expect(result?.id).toBe(eventDocument.id);
});

test("closes the latest open event and creates the replacement in one transaction", async () => {
  const previousReference = { path: "events/previous" };
  const nextReference = { path: `events/${eventDocument.id}` };
  const writes: Array<{ reference: unknown; data: unknown; options?: unknown }> = [];
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
  };
  const collection = {
    ...query,
    doc: () => nextReference,
  };
  const database = {
    collection: () => collection,
    runTransaction: async (callback: (transaction: unknown) => Promise<void>) =>
      callback({
        get: async () => ({
          docs: [{ ref: previousReference, data: () => ({ ...eventDocument, id: "previous" }) }],
        }),
        set: (reference: unknown, data: unknown, options?: unknown) => {
          writes.push({ reference, data, options });
        },
      }),
  } as unknown as Firestore;

  await new AdminFirestoreEventDao(database).createClosingLatestOpen(
    eventDocument,
    "2026-08-17T12:00:00.000Z",
  );

  expect(writes).toEqual([
    {
      reference: previousReference,
      data: {
        finishedAt: "2026-08-17T12:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z",
      },
      options: { merge: true },
    },
    { reference: nextReference, data: eventDocument, options: undefined },
  ]);
});
