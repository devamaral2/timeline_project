import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { TimelineEventCardDto } from '@repo/entities/contracts';

const fetchFromBackend = vi.fn();

vi.mock('@/lib/api/backend', () => ({
  fetchFromBackend: (path: string) => fetchFromBackend(path),
}));

vi.mock('@/components/layout/TimelineHeader', () => ({
  TimelineHeader: ({ userId }: { userId: string }) => (
    <p>Timeline de {userId}</p>
  ),
}));

const { default: UserTimelinePage } = await import('./page');

const event: TimelineEventCardDto = {
  id: 'event-1',
  type: 'food',
  missed: false,
  accentColor: 'orange',
  iconName: 'utensils',
  name: 'Café da manhã',
  description: '',
  startedAt: '2026-08-19T08:30:00-03:00',
  finishedAt: '2026-08-19T08:50:00-03:00',
  durationLabel: '20m',
  tags: [],
  interruptions: [],
};

beforeEach(() => {
  fetchFromBackend.mockReset();
});

test('renders the timeline of the requested user', async () => {
  fetchFromBackend.mockResolvedValue([event]);

  render(
    await UserTimelinePage({ params: Promise.resolve({ userId: 'user-1' }) }),
  );

  expect(screen.getByText('Timeline de user-1')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 3, name: 'Café da manhã' }),
  ).toBeInTheDocument();
});

test('asks the backend only for the current civil day of that user', async () => {
  fetchFromBackend.mockResolvedValue([]);

  await UserTimelinePage({ params: Promise.resolve({ userId: 'user-42' }) });

  const requestedPath = fetchFromBackend.mock.calls[0]?.[0] as string;
  const query = new URLSearchParams(requestedPath.split('?')[1]);
  expect(requestedPath.startsWith('/api/events?')).toBe(true);
  expect(query.get('userId')).toBe('user-42');
  expect(
    new Date(query.get('to')!).getTime() -
      new Date(query.get('from')!).getTime(),
  ).toBe(24 * 60 * 60 * 1000 - 1);
});
