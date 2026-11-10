import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AgendaDay } from "./agenda-day";
import { EXAMPLE_NOW, EXAMPLE_TODAY } from "./agenda-examples";

const props = { dayKey: EXAMPLE_TODAY, now: EXAMPLE_NOW, tasks: {}, missedEvents: {}, onSelectEvent: vi.fn() };

test("an event in its window shows start and end times, not a running timer", () => {
  render(<AgendaDay {...props} />);

  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.queryByText("Em andamento")).not.toBeInTheDocument();
  expect(screen.getByText("09:00 — 10:30")).toBeInTheDocument();
});

test("task status and the event annotation do not change the card timing", () => {
  render(<AgendaDay {...props}
    tasks={{ "BRD-25": { id: "BRD-25", status: "completed", priority: "flexible" } }}
    missedEvents={{ [`${EXAMPLE_TODAY}:Revisar proposta`]: true }}
  />);

  const task = screen.getByRole("button", { name: "Tarefa de Revisar proposta: Concluída" });
  const card = task.closest("article");
  if (!card) throw new Error("Card da tarefa não encontrado");
  expect(within(card).queryByRole("timer")).not.toBeInTheDocument();
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

test("an event is upcoming until it ends and past afterwards", () => {
  render(<AgendaDay {...props} events={[
    { name: "Reunião longa", type: "routine", time: "09:00 — 11:00", minutes: 120, duration: "2 h", startedAt: "2026-09-14T09:00:00-03:00", finishedAt: "2026-09-14T11:00:00-03:00" },
    { name: "Mais cedo", type: "meal", time: "07:00 — 07:30", minutes: 30, duration: "30 min", startedAt: "2026-09-14T07:00:00-03:00", finishedAt: "2026-09-14T07:30:00-03:00" },
  ]} />);

  expect(screen.getByRole("button", { name: "Reunião longa" }).closest("article")).toHaveAttribute("data-time-position", "upcoming");
  expect(screen.getByRole("button", { name: "Mais cedo" }).closest("article")).toHaveAttribute("data-time-position", "past");
});

const slotsOf = () => Array.from(document.querySelectorAll<HTMLElement>("[data-free-time]"));

test("free time blocks fill the gaps between events and until midnight, with their duration highlighted", () => {
  render(<AgendaDay {...props} dayKey="2026-09-15" events={[
    { name: "Almoço", type: "meal", time: "13:00 — 14:00", minutes: 60, duration: "1 h", startedAt: "2026-09-15T13:00:00-03:00", finishedAt: "2026-09-15T14:00:00-03:00" },
    { name: "Jantar", type: "meal", time: "20:00 — 21:00", minutes: 60, duration: "1 h", startedAt: "2026-09-15T20:00:00-03:00", finishedAt: "2026-09-15T21:00:00-03:00" },
  ]} />);

  const [between, afterLast] = slotsOf();
  expect(slotsOf()).toHaveLength(2);
  expect(between).toHaveTextContent("Tempo livre14:00 — 20:00");
  expect(within(between).getByText("6")).toBeInTheDocument();
  expect(within(between).getByText("h")).toBeInTheDocument();
  expect(afterLast).toHaveTextContent("Tempo livre21:00 — 24:00");
  expect(within(afterLast).getByText("3")).toBeInTheDocument();
  // São leitura: não são cartões de evento nem têm ação.
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(within(between).queryByRole("button")).not.toBeInTheDocument();
  expect(within(between).queryByRole("link")).not.toBeInTheDocument();
});

test("free time keeps the chronological order and marks the block that is happening now", () => {
  render(<AgendaDay {...props} now={new Date("2026-09-14T15:00:00-03:00").getTime()} events={[
    { name: "Manhã", type: "routine", time: "08:00 — 09:00", minutes: 60, duration: "1 h", startedAt: "2026-09-14T08:00:00-03:00", finishedAt: "2026-09-14T09:00:00-03:00" },
    { name: "Noite", type: "routine", time: "20:00 — 21:00", minutes: 60, duration: "1 h", startedAt: "2026-09-14T20:00:00-03:00", finishedAt: "2026-09-14T21:00:00-03:00" },
  ]} />);

  const items = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
  expect(items[0]).toContain("Manhã");
  expect(items[1]).toContain("Tempo livre");
  expect(items[2]).toContain("Noite");
  expect(items[3]).toContain("Tempo livre");
  expect(slotsOf()[0]).toHaveAttribute("data-time-position", "now");
  expect(within(slotsOf()[0]).getByText("Livre agora")).toBeInTheDocument();
  expect(slotsOf()[1]).toHaveAttribute("data-time-position", "upcoming");
});

test("an empty day and the event count do not get free time blocks", () => {
  render(<AgendaDay {...props} events={[]} />);
  expect(slotsOf()).toHaveLength(0);
});
