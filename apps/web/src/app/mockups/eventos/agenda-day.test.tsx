import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AgendaDay } from "./agenda-day";
import { EXAMPLE_NOW, EXAMPLE_TODAY } from "./agenda-examples";

const props = { dayKey: EXAMPLE_TODAY, now: EXAMPLE_NOW, tasks: {}, missedEvents: {}, onSelectEvent: vi.fn() };

test("the running event counts elapsed time instead of showing a finished duration", () => {
  const { rerender } = render(<AgendaDay {...props} />);

  expect(screen.getByRole("timer")).toHaveTextContent("35:00");
  expect(screen.getByText("Em andamento")).toBeInTheDocument();
  expect(screen.queryByText("09:00 — 10:30")).not.toBeInTheDocument();

  rerender(<AgendaDay {...props} now={EXAMPLE_NOW + 62_000} />);
  expect(screen.getByRole("timer")).toHaveTextContent("36:02");
});

test("task status and the event annotation do not stop the event timer", () => {
  render(<AgendaDay {...props}
    tasks={{ "BRD-25": { id: "BRD-25", status: "completed", priority: "flexible" } }}
    missedEvents={{ [`${EXAMPLE_TODAY}:Revisar proposta`]: true }}
  />);

  const task = screen.getByRole("button", { name: "Tarefa de Revisar proposta: Concluída" });
  const card = task.closest("article");
  if (!card) throw new Error("Card da tarefa não encontrado");
  expect(within(card).getByRole("timer")).toHaveTextContent("35:00");
  expect(within(card).getByText("Não realizado")).toBeInTheDocument();
  expect(card).toHaveAttribute("data-missed", "true");
  expect(within(card).getByRole("img", { name: "Prioridade da tarefa: Flexível" })).toBeInTheDocument();
});

test("future and past days neither start timers nor add missed annotations", () => {
  const { rerender } = render(<AgendaDay {...props} dayKey="2026-09-15" />);
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.queryByText("Não realizado")).not.toBeInTheDocument();
  expect(screen.getByTitle("Duração prevista: 45 min")).toBeInTheDocument();

  rerender(<AgendaDay {...props} dayKey="2026-09-12" />);
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.queryByText("Não realizado")).not.toBeInTheDocument();
  expect(screen.getByTitle("Duração: 1 h")).toBeInTheDocument();
});

test("empty days can be omitted from the continuous list", () => {
  const { rerender } = render(<AgendaDay {...props} events={[]} />);
  expect(screen.getByText("Um dia livre, do seu jeito.")).toBeInTheDocument();

  rerender(<AgendaDay {...props} events={[]} hideWhenEmpty />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByText("Um dia livre, do seu jeito.")).not.toBeInTheDocument();
});

test("an event that already started and has an end time still gets the running highlight", () => {
  render(<AgendaDay {...props} events={[
    { name: "Reunião longa", type: "routine", time: "09:00 — 11:00", minutes: 120, duration: "2 h", startedAt: "2026-09-14T09:00:00-03:00", finishedAt: "2026-09-14T11:00:00-03:00" },
    { name: "Mais tarde", type: "meal", time: "12:00 — 12:30", minutes: 30, duration: "30 min", startedAt: "2026-09-14T12:00:00-03:00", finishedAt: "2026-09-14T12:30:00-03:00" },
  ]} />);

  expect(screen.getByRole("button", { name: "Reunião longa" }).closest("article")).toHaveAttribute("data-time-position", "running");
  expect(screen.getByRole("button", { name: "Mais tarde" }).closest("article")).toHaveAttribute("data-time-position", "upcoming");
});
