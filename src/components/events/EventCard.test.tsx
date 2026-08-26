import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";
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
  render(<EventCard event={anEvent()} />);

  expect(screen.getByRole("button", { name: "Academia" })).toBeInTheDocument();
  expect(screen.getByText(/18:00/)).toBeInTheDocument();
  expect(screen.getByText(/19:25/)).toBeInTheDocument();
  expect(screen.getByText("1h 25m")).toBeInTheDocument();
});

test("marks an event without finishedAt as still running", () => {
  render(<EventCard event={anEvent({ finishedAt: undefined, durationLabel: "--" })} />);

  expect(screen.getByText(/em andamento/)).toBeInTheDocument();
});

test("renders tags", () => {
  render(<EventCard event={anEvent({ tags: ["treino", "saúde"] })} />);

  expect(screen.getByText("#treino")).toBeInTheDocument();
  expect(screen.getByText("#saúde")).toBeInTheDocument();
});

test("opens the details modal from the title and surfaces load failures", async () => {
  render(<EventCard event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));

  expect(screen.getByRole("dialog", { name: "Academia" })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/não foi possível carregar o evento/i)).toBeInTheDocument();
  });
});

test("opens the edit modal from the details modal", async () => {
  render(<EventCard event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));

  expect(screen.getByRole("dialog", { name: /editar evento/i })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/não foi possível carregar o evento/i)).toBeInTheDocument();
  });
});

test("opens the delete confirmation from the details modal and asks for confirmation", () => {
  render(<EventCard event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

  const dialog = screen.getByRole("alertdialog", { name: /excluir evento/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByText(/tem certeza que deseja excluir/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("surfaces a failure when deleting without an authenticated user", async () => {
  render(<EventCard event={anEvent({ name: "Academia" })} />);

  fireEvent.click(screen.getByRole("button", { name: "Academia" }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

  await waitFor(() => {
    expect(screen.getByText(/não foi possível excluir o evento/i)).toBeInTheDocument();
  });
});
