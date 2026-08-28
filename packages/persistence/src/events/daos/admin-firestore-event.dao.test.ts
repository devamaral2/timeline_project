import type { Firestore } from 'firebase-admin/firestore';
import { expect, test } from 'vitest';
import type { EventDocument } from '../mappers/event-document.mapper';
import { AdminFirestoreEventDao } from './admin-firestore-event.dao';

const eventDocument: EventDocument = {
  id: '01K2R1J5M8S0Y2Z7ABCD123462',
  type: 'routine',
  userId: 'user-1',
  name: 'Planning',
  description: '',
  startedAt: '2026-08-17T12:00:00.000Z',
  tags: [],
  interruptions: [],
  data: {},
  createdAt: '2026-08-17T12:00:00.000Z',
  updatedAt: '2026-08-17T12:00:00.000Z',
};

test('limits the latest user-event lookup to one document', async () => {
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

  const result = await new AdminFirestoreEventDao(
    database,
  ).findLatestOpenByUserId('user-1');

  expect(requestedLimit).toBe(1);
  expect(result?.id).toBe(eventDocument.id);
});

test('lists events that start inside or carry into the requested interval', async () => {
  type Clause = [field: string, operator: string, value: unknown];
  const requestedQueries: Clause[][] = [];
  const startedInside = {
    ...eventDocument,
    id: 'started-inside',
    startedAt: '2026-08-27T10:00:00.000Z',
    finishedAt: '2026-08-27T11:00:00.000Z',
  };
  const carriesIntoDay = {
    ...eventDocument,
    id: 'carries-into-day',
    startedAt: '2026-08-26T02:00:00.000Z',
    finishedAt: '2026-08-28T04:00:00.000Z',
  };

  function query(clauses: Clause[] = []) {
    return {
      where: (field: string, operator: string, value: unknown) =>
        query([...clauses, [field, operator, value]]),
      orderBy: (field: string, direction: string) =>
        query([...clauses, [`orderBy:${field}`, direction, undefined]]),
      get: async () => {
        requestedQueries.push(clauses);
        const documents = clauses.some(
          ([field, operator]) => field === 'startedAt' && operator === '<',
        )
          ? [carriesIntoDay]
          : [startedInside];
        return {
          docs: documents.map((document) => ({ data: () => document })),
        };
      },
    };
  }

  const database = { collection: () => query() } as unknown as Firestore;
  const result = await new AdminFirestoreEventDao(database).list({
    userId: 'user-1',
    from: '2026-08-27T03:00:00.000Z',
    to: '2026-08-28T02:59:59.999Z',
  });

  expect(result.map((document) => document.id)).toEqual([
    'started-inside',
    'carries-into-day',
  ]);
  expect(requestedQueries).toContainEqual([
    ['userId', '==', 'user-1'],
    ['startedAt', '<', '2026-08-27T03:00:00.000Z'],
    ['finishedAt', '>=', '2026-08-27T03:00:00.000Z'],
    ['orderBy:finishedAt', 'asc', undefined],
    ['orderBy:startedAt', 'desc', undefined],
  ]);
});

const previousReference = { path: 'events/previous' };
const nextReference = { path: `events/${eventDocument.id}` };

function aDatabaseHoldingLatestEvent(
  latestEvent: Partial<EventDocument>,
  writes: Array<{ reference: unknown; data: unknown; options?: unknown }>,
): Firestore {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
  };
  const collection = {
    ...query,
    doc: () => nextReference,
  };
  return {
    collection: () => collection,
    runTransaction: async (callback: (transaction: unknown) => Promise<void>) =>
      callback({
        get: async () => ({
          docs: [{ ref: previousReference, data: () => latestEvent }],
        }),
        set: (reference: unknown, data: unknown, options?: unknown) => {
          writes.push({ reference, data, options });
        },
      }),
  } as unknown as Firestore;
}

test('closes the latest open event and creates the replacement in one transaction', async () => {
  const writes: Array<{
    reference: unknown;
    data: unknown;
    options?: unknown;
  }> = [];
  const database = aDatabaseHoldingLatestEvent(
    { ...eventDocument, id: 'previous' },
    writes,
  );

  await new AdminFirestoreEventDao(database).createClosingLatestOpen(
    eventDocument,
    '2026-08-17T12:00:00.000Z',
  );

  expect(writes).toEqual([
    {
      reference: previousReference,
      data: {
        finishedAt: '2026-08-17T12:00:00.000Z',
        updatedAt: '2026-08-17T12:00:00.000Z',
      },
      options: { merge: true },
    },
    { reference: nextReference, data: eventDocument, options: undefined },
  ]);
});

test('skips closing an event that started after the incoming finishedAt', async () => {
  const writes: Array<{
    reference: unknown;
    data: unknown;
    options?: unknown;
  }> = [];
  const database = aDatabaseHoldingLatestEvent(
    { ...eventDocument, id: 'previous', startedAt: '2026-08-17T12:05:00.000Z' },
    writes,
  );

  // Escritas fora de ordem gravariam finishedAt < startedAt, e a entidade rejeita isso em toda
  // leitura -- a timeline inteira pararia de renderizar.
  await new AdminFirestoreEventDao(database).createClosingLatestOpen(
    eventDocument,
    '2026-08-17T12:00:00.000Z',
  );

  expect(writes).toEqual([
    { reference: nextReference, data: eventDocument, options: undefined },
  ]);
});
