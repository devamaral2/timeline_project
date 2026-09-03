import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type {
  TimelineEventCardDto,
  TimelineEventPageDto,
} from '@repo/entities/contracts';
import { TestIntersectionObserver } from '@/test/setup';
import { TimelineList } from './TimelineList';

const user = { uid: 'user-1', getIdToken: async () => 'test-token' };
let signedIn: typeof user | null = user;

vi.mock('@/lib/firebase/use-current-user', () => ({
  useAuthState: () => ({ user: signedIn, ready: true }),
  useCurrentUser: () => signedIn,
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    get currentUser() {
      return signedIn;
    },
  }),
}));
vi.mock('@/lib/firebase/client-app', () => ({ getClientApp: () => ({}) }));

function anEvent(
  overrides: Partial<TimelineEventCardDto> = {},
): TimelineEventCardDto {
  return {
    id: 'event-1',
    primaryItemId: 'item-1',
    primaryItemType: 'routine',
    itemTypes: ['routine'],
    missed: false,
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

function aPage(page: TimelineEventPageDto): Response {
  return new Response(JSON.stringify(page));
}

function renderTimeline() {
  return render(<TimelineList userId="user-1" todayKey="2026-08-19" />);
}

beforeEach(() => {
  signedIn = user;
  TestIntersectionObserver.instances.length = 0;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('asks for the current day of the signed in user, with the token and without a userId', async () => {
  vi.mocked(fetch).mockResolvedValue(aPage({ items: [anEvent()] }));
  renderTimeline();

  await waitFor(() => expect(fetch).toHaveBeenCalled());

  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  expect(url).toBe(
    '/api/events?from=2026-08-19T03%3A00%3A00.000Z&to=2026-08-20T02%3A59%3A59.999Z',
  );
  expect(url).not.toContain('userId');
  expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token' });
  expect(
    await screen.findByRole('heading', { level: 3, name: 'Bloco de trabalho' }),
  ).toBeInTheDocument();
});

test('does not ask for anything while nobody is signed in', async () => {
  signedIn = null;
  renderTimeline();

  expect(
    await screen.findByText('Entre na sua conta para ver esta timeline.'),
  ).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test('renders one list for the selected day without repeating its date as a content title', async () => {
  vi.mocked(fetch).mockResolvedValue(aPage({ items: [anEvent()] }));
  renderTimeline();

  expect(
    await screen.findByRole('heading', { level: 3, name: 'Bloco de trabalho' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: '19 de agosto de 2026' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: '19 de agosto de 2026' }),
  ).toHaveTextContent('1 evento · 3h registradas');
});

test('loads only the day selected in the week header', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(aPage({ items: [anEvent()] }))
    .mockResolvedValueOnce(
      aPage({
        items: [
          anEvent({
            id: 'previous-day',
            name: 'Evento de terça',
            startedAt: '2026-08-18T09:00:00-03:00',
            finishedAt: '2026-08-18T10:00:00-03:00',
          }),
        ],
      }),
    );
  renderTimeline();
  await screen.findByRole('heading', { level: 3, name: 'Bloco de trabalho' });

  fireEvent.click(screen.getByRole('button', { name: '2026-08-18' }));

  expect(
    await screen.findByRole('heading', { level: 3, name: 'Evento de terça' }),
  ).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
    '/api/events?from=2026-08-18T03%3A00%3A00.000Z&to=2026-08-19T02%3A59%3A59.999Z',
  );
  expect(
    screen.queryByRole('heading', { level: 3, name: 'Bloco de trabalho' }),
  ).not.toBeInTheDocument();
});

test('adds the second page to the first without repeating what came in both', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      aPage({
        items: [anEvent({ id: 'a', name: 'Primeiro' }), anEvent({ id: 'b', name: 'Segundo' })],
        nextCursor: 'page-2',
      }),
    )
    .mockResolvedValueOnce(
      aPage({
        items: [anEvent({ id: 'b', name: 'Segundo' }), anEvent({ id: 'c', name: 'Terceiro' })],
      }),
    );
  renderTimeline();

  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

  expect(
    await screen.findByRole('heading', { level: 3, name: 'Terceiro' }),
  ).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain('cursor=page-2');
  expect(screen.getAllByRole('heading', { level: 3, name: 'Segundo' })).toHaveLength(1);
});

test('the load more button is gone when there is no next cursor', async () => {
  vi.mocked(fetch).mockResolvedValue(aPage({ items: [anEvent()] }));
  renderTimeline();

  await screen.findByRole('heading', { level: 3, name: 'Bloco de trabalho' });
  expect(
    screen.queryByRole('button', { name: 'Carregar mais' }),
  ).not.toBeInTheDocument();
});

test('does not fetch more days when the rendered content reaches the viewport', async () => {
  vi.mocked(fetch).mockResolvedValue(aPage({ items: [anEvent()] }));
  renderTimeline();
  await screen.findByRole('heading', { level: 3, name: 'Bloco de trabalho' });

  TestIntersectionObserver.instances.at(-1)?.triggerIntersection();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
});

test('shows the empty state for the selected day', async () => {
  vi.mocked(fetch).mockResolvedValue(aPage({ items: [] }));
  renderTimeline();

  expect(
    await screen.findByText('Nenhum evento registrado neste dia.'),
  ).toBeInTheDocument();
});
