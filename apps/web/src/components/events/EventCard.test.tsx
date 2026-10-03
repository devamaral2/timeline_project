import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { TimelineEventCardDto } from "@/lib/api/contracts";
import { EventCard } from "./EventCard";


function anEvent(overrides: Partial<TimelineEventCardDto> = {}): TimelineEventCardDto {
  return {
    id: "event-1",
    kind: "training",
    noteTypes: [],
    missed: false,
    notifyOffsetsMinutes: [],
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
  expect(screen.getByText("25")).toBeInTheDocument();
});

test("names the card after the primary item, not after the event", () => {
  render(<EventCard event={anEvent()} />);

  expect(screen.getByText("Treino")).toBeInTheDocument();
});

test("the notes do not change the color or the icon of the card", () => {
  // O treino que tambem registrou a refeicao de depois continua sendo um
  // treino: quem responde "o que e isto?" e o `kind` do evento, e so ele.
  const { container: onlyTraining } = render(
    <EventCard event={anEvent()} />,
  );
  const { container: alsoAMeal } = render(
    <EventCard
     
      event={anEvent({ noteTypes: ["training", "meal"] })}
    />,
  );

  expect(alsoAMeal.querySelector("svg")?.outerHTML).toBe(
    onlyTraining.querySelector("svg")?.outerHTML,
  );
  expect(screen.getAllByText("Treino")).toHaveLength(2);
  expect(screen.queryByText("Refeição")).not.toBeInTheDocument();
});

test("a type this frontend does not know yet falls back instead of breaking", () => {
  // As naturezas de evento do backend crescem sem pedir licenca ao web.
  render(
    <EventCard
     
      event={anEvent({ kind: "meditation" as never, noteTypes: ["meditation"] })}
    />,
  );

  expect(screen.getByText("Evento")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Academia" })).toBeInTheDocument();
});

test("marks an event without finishedAt as still running", () => {
  render(
    <EventCard event={anEvent({ finishedAt: undefined, durationLabel: "--" })} />,
  );

  expect(screen.getByText(/Em andamento/)).toBeInTheDocument();
});

test("counts the time of a running event instead of showing the api placeholder", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-19T18:42:30-03:00"));
  try {
    render(
      <EventCard
       
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

test("shows the badge only on the events the user marked as missed", () => {
  render(<EventCard event={anEvent()} />);
  expect(screen.queryByText("Não realizado")).not.toBeInTheDocument();

  render(<EventCard event={anEvent({ missed: true })} />);
  expect(screen.getByText("Não realizado")).toBeInTheDocument();
});

test("renders the card even when the mark does not come at all", () => {
  // O DTO e tipado, mas a resposta vem pela rede: um backend de outra versao
  // nao pode derrubar a timeline por causa de um campo que nao mandou.
  render(<EventCard event={anEvent({ missed: undefined as never })} />);

  expect(screen.getByRole("button", { name: "Academia" })).toBeInTheDocument();
});
