import { expect, test } from 'vitest';
import { RoutineEvent } from '@repo/entities';
import { InMemoryEventRepository } from '../testing/in-memory-event.repository';
import { ListTimelineEventsUseCase } from './list-timeline-events.usecase';

function aRoutineEvent(props: {
  id: string;
  startedAt: string;
  finishedAt?: string;
  missed?: boolean;
}) {
  return RoutineEvent.create({
    id: props.id,
    userId: 'user-1',
    name: 'Bloco de trabalho',
    description: '',
    startedAt: new Date(props.startedAt),
    finishedAt: props.finishedAt ? new Date(props.finishedAt) : undefined,
    tags: [],
    interruptions: [],
    data: {},
    missed: props.missed,
  });
}

async function marksOf(events: RoutineEvent[]) {
  const useCase = new ListTimelineEventsUseCase(
    new InMemoryEventRepository(events),
  );
  const cards = await useCase.execute({ userId: 'user-1' });
  return new Map(cards.map((card) => [card.id, card.missed]));
}

test('sends every card with the mark the user made, and nothing else about it', async () => {
  const marks = await marksOf([
    aRoutineEvent({
      id: 'done',
      startedAt: '2026-08-19T09:00:00.000Z',
      finishedAt: '2026-08-19T11:00:00.000Z',
    }),
    aRoutineEvent({ id: 'open', startedAt: '2026-08-19T14:00:00.000Z' }),
    aRoutineEvent({
      id: 'skipped',
      startedAt: '2026-08-19T13:00:00.000Z',
      missed: true,
    }),
  ]);

  expect(marks.get('done')).toBe(false);
  expect(marks.get('open')).toBe(false);
  expect(marks.get('skipped')).toBe(true);
});

test('never marks an event the clock left behind', async () => {
  // Nao ha hora que ligue a marca sozinha: um evento antigo que ninguem anotou
  // continua sem anotacao, hoje e daqui a um ano.
  const marks = await marksOf([
    aRoutineEvent({
      id: 'long-gone',
      startedAt: '2020-01-01T09:00:00.000Z',
      finishedAt: '2020-01-01T10:00:00.000Z',
    }),
  ]);

  expect(marks.get('long-gone')).toBe(false);
});

test('lists every closed event whose interval intersects the selected day', async () => {
  const useCase = new ListTimelineEventsUseCase(
    new InMemoryEventRepository([
      aRoutineEvent({
        id: 'starts-in-day',
        startedAt: '2026-08-27T10:00:00.000Z',
        finishedAt: '2026-08-27T11:00:00.000Z',
      }),
      aRoutineEvent({
        id: 'ends-in-day',
        startedAt: '2026-08-26T23:00:00.000Z',
        finishedAt: '2026-08-27T04:00:00.000Z',
      }),
      aRoutineEvent({
        id: 'covers-whole-day',
        startedAt: '2026-08-26T02:00:00.000Z',
        finishedAt: '2026-08-28T04:00:00.000Z',
      }),
      aRoutineEvent({
        id: 'ended-before',
        startedAt: '2026-08-26T02:00:00.000Z',
        finishedAt: '2026-08-27T02:59:59.999Z',
      }),
      aRoutineEvent({
        id: 'starts-after',
        startedAt: '2026-08-28T03:00:00.000Z',
        finishedAt: '2026-08-28T04:00:00.000Z',
      }),
      aRoutineEvent({
        id: 'open-from-previous-day',
        startedAt: '2026-08-26T10:00:00.000Z',
      }),
    ]),
  );

  const cards = await useCase.execute({
    userId: 'user-1',
    from: '2026-08-27T03:00:00.000Z',
    to: '2026-08-28T02:59:59.999Z',
  });

  expect(cards.map((card) => card.id).sort()).toEqual([
    'covers-whole-day',
    'ends-in-day',
    'starts-in-day',
  ]);
});
