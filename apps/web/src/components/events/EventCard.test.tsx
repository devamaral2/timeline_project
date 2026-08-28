import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { EventCard } from "./EventCard";

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
}));
vi.mock("@/lib/firebase/client-app", () => ({
  getClientApp: () => ({}),
}));

function anEvent(overrides: Partial<TimelineEventCardDto> = {}): TimelineEventCardDto {
  return {
    id: "event-1",
    type: "training",
    missed: false,
    accentColor: "red",
    iconName: "dumbbell",
    name: "Academia",
    description: "",
    startedAt: "2026-08-19T18:00:00-03:00",
    finishedAt: "2026-08-19T19:25:00-03:00",
    durationLabel: "1h 25m",
    tags: [],
    interruptions: [],
    ...overrides,
  };
}

test("shows the name, the local time range and the duration from the api", () => {
  render(<EventCard longestMinutes={85} event={anEvent()} />);

  expect(screen.getByRole("button", { name: "Academia" })).toBeInTheDocument();
  expect(screen.getByText(/18:00/)).toBeInTheDocument();
  expect(screen.getByText(/19:25/)).toBeInTheDocument();
  expect(screen.getByText("1h 25m")).toBeInTheDocument();
});

test("marks an event without finishedAt as still running", () => {
  render(
    <EventCard longestMinutes={85} event={anEvent({ finishedAt: undefined, durationLabel: "--" })} />,
  );

  expect(screen.getByText(/em andamento/)).toBeInTheDocument();
});

test("counts the time of a running event instead of showing the api placeholder", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-19T18:42:30-03:00"));
  try {
    render(
      <EventCard
        longestMinutes={85}
        event={anEvent({ finishedAt: undefined, durationLabel: "--" })}
      />,
    );

    // Comecou 18:00, agora sao 18:42:30.
    expect(screen.getByText("42:30")).toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("draws the duration bar in proportion to the longest event of the day", () => {
  // 85 minutos contra um dia cujo maior evento tem 170: metade da largura.
  const { container } = render(<EventCard longestMinutes={170} event={anEvent()} />);
  // A barra e o unico elemento do cartao com largura inline.
  const bar = container.querySelector<HTMLElement>("span[style]");

  expect(bar?.style.width).toBe("50%");
});

test("renders tags", () => {
  render(<EventCard longestMinutes={85} event={anEvent({ tags: ["treino", "saúde"] })} />);

  expect(screen.getByText("#treino")).toBeInTheDocument();
  expect(screen.getByText("#saúde")).toBeInTheDocument();
});

test("opens the details modal from the title and surfaces load failures", async () => {
  render(<EventCard longestMinutes={85} event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));

  expect(screen.getByRole("dialog", { name: "Academia" })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/não foi possível carregar o evento/i)).toBeInTheDocument();
  });
});

test("opens the edit modal from the details modal", async () => {
  render(<EventCard longestMinutes={85} event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));

  expect(screen.getByRole("dialog", { name: /editar evento/i })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/não foi possível carregar o evento/i)).toBeInTheDocument();
  });
});

test("opens the delete confirmation from the details modal and asks for confirmation", () => {
  render(<EventCard longestMinutes={85} event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

  const dialog = screen.getByRole("alertdialog", { name: /excluir evento/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByText(/tem certeza que deseja excluir/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("surfaces a failure when deleting without an authenticated user", async () => {
  render(<EventCard longestMinutes={85} event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

  await waitFor(() => {
    expect(screen.getByText(/não foi possível excluir o evento/i)).toBeInTheDocument();
  });
});

test("shows the badge only on the events the user marked as missed", () => {
  render(<EventCard longestMinutes={85} event={anEvent()} />);
  expect(screen.queryByText("Não realizado")).not.toBeInTheDocument();

  render(<EventCard longestMinutes={85} event={anEvent({ missed: true })} />);
  expect(screen.getByText("Não realizado")).toBeInTheDocument();
});

test("renders the card even when the mark does not come at all", () => {
  // O DTO e tipado, mas a resposta vem pela rede: um backend de outra versao
  // nao pode derrubar a timeline por causa de um campo que nao mandou.
  render(<EventCard longestMinutes={85} event={anEvent({ missed: undefined as never })} />);

  expect(screen.getByRole("button", { name: "Academia" })).toBeInTheDocument();
});
