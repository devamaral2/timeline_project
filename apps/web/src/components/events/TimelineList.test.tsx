import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { TimelineEventCardDto } from '@repo/entities/contracts';
import { TestIntersectionObserver } from '@/test/setup';
import { TimelineList } from './TimelineList';

vi.mock('@/lib/firebase/use-current-user', () => ({
  useCurrentUser: () => null,
}));

function anEvent(
  overrides: Partial<TimelineEventCardDto> = {},
): TimelineEventCardDto {
  return {
    id: 'event-1',
    type: 'routine',
    missed: false,
    accentColor: 'blue',
    iconName: 'clock',
    name: 'Bloco de trabalho',
    description: '',
    startedAt: '2026-08-19T09:00:00-03:00',
    finishedAt: '2026-08-19T12:00:00-03:00',
    durationLabel: '3h 00m',
    tags: [],
    interruptions: [],
    ...overrides,
  };
}

function renderTimeline(initialEvents: TimelineEventCardDto[]) {
  return render(
    <TimelineList
      userId="user-1"
      initialEvents={initialEvents}
      todayKey="2026-08-19"
    />,
  );
}

beforeEach(() => {
  TestIntersectionObserver.instances.length = 0;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('renders one list for the selected day without repeating its date as a content title', () => {
  renderTimeline([anEvent()]);

  expect(
    screen.getByRole('heading', { level: 3, name: 'Bloco de trabalho' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: '19 de agosto de 2026' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: '19 de agosto de 2026' }),
  ).toHaveTextContent('1 evento · 3h registradas');
});

test('loads only the day selected in the week header', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify([
        anEvent({
          id: 'previous-day',
          name: 'Evento de terça',
          startedAt: '2026-08-18T09:00:00-03:00',
          finishedAt: '2026-08-18T10:00:00-03:00',
        }),
      ]),
    ),
  );
  renderTimeline([anEvent()]);

  fireEvent.click(screen.getByRole('button', { name: '2026-08-18' }));

  expect(fetch).toHaveBeenCalledWith(
    '/api/events?userId=user-1&from=2026-08-18T03%3A00%3A00.000Z&to=2026-08-19T02%3A59%3A59.999Z',
  );
  expect(
    await screen.findByRole('heading', { level: 3, name: 'Evento de terça' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { level: 3, name: 'Bloco de trabalho' }),
  ).not.toBeInTheDocument();
});

test('does not fetch more days when the rendered content reaches the viewport', async () => {
  renderTimeline([anEvent()]);

  TestIntersectionObserver.instances.at(-1)?.triggerIntersection();
  await waitFor(() => expect(fetch).not.toHaveBeenCalled());
});

test('shows the empty state for the selected day', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([])));
  renderTimeline([anEvent()]);

  fireEvent.click(screen.getByRole('button', { name: '2026-08-18' }));

  expect(
    await screen.findByText('Nenhum evento registrado neste dia.'),
  ).toBeInTheDocument();
});
