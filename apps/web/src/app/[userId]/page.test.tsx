import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('@/components/events/TimelineList', () => ({
  TimelineList: ({ userId, todayKey }: { userId: string; todayKey: string }) => (
    <p>
      Timeline de {userId} em {todayKey}
    </p>
  ),
}));

const { default: UserTimelinePage } = await import('./page');

test('renders the timeline of the requested user without reading the backend', async () => {
  // A pagina nao busca nada: a leitura exige o ID token do Firebase, que so
  // existe no cliente. Se ela voltar a buscar, este teste quebra no fetch
  // global que ninguem preparou.
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  render(
    await UserTimelinePage({ params: Promise.resolve({ userId: 'user-1' }) }),
  );

  expect(screen.getByText(/Timeline de user-1/)).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test('resolves the civil day on the server, so hydration does not disagree', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-19T23:30:00-03:00'));
  try {
    render(
      await UserTimelinePage({
        params: Promise.resolve({ userId: 'user-42' }),
      }),
    );

    expect(screen.getByText(/em 2026-08-19/)).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
