import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDetailDto, TaskDetailDto } from "@/lib/api/contracts";
import { EventDetailScreen } from "./EventDetailScreen";

/** 15 de abril de 2026, 10:00 — 11:00 no fuso da timeline. */
function eventAt(overrides: Partial<EventDetailDto> = {}): EventDetailDto {
  return {
    id: "evento-1",
    name: "Reunião de planejamento",
    description: "Fechar o escopo da próxima entrega.",
    startedAt: "2026-04-15T10:00:00-03:00",
    finishedAt: "2026-04-15T11:00:00-03:00",
    tags: ["trabalho"],
    missed: false,
    priority: "normal",
    notifyOffsetsMinutes: [],
    interruptions: [],
    revision: 3,
    primaryItemId: "item-1",
    items: [{ id: "item-1", position: 0, type: "routine", schemaVersion: 1, isPrimary: true, data: {} }],
    ...overrides,
  };
}

const task: TaskDetailDto = {
  id: "tarefa-1",
  name: "Escrever a ata",
  description: "",
  status: "todo",
  priority: "medium",
  notifyOffsetsMinutes: [],
  tags: [],
  dependsOnTaskIds: [],
  revision: 1,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-04-15T15:00:00-03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("mostra a composição da tela: tipo, nome, data, horário e as seções", () => {
  render(<EventDetailScreen event={eventAt()} backHref="/alguem" />);

  expect(screen.getByRole("heading", { level: 1, name: "Reunião de planejamento" })).toBeInTheDocument();
  expect(screen.getByText("Rotina")).toBeInTheDocument();
  expect(screen.getByText("15 abr 2026")).toBeInTheDocument();
  expect(screen.getByText("10:00")).toBeInTheDocument();
  expect(screen.getByText("11:00")).toBeInTheDocument();
  expect(screen.getByText("1h")).toBeInTheDocument();

  for (const title of ["Descrição", "Tarefas", "Notas"]) {
    expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "Voltar para a agenda" })).toHaveAttribute("href", "/alguem");
});

test("o cartão resume tags, metadados e a situação do evento no tempo", () => {
  render(
    <EventDetailScreen
      event={eventAt({ priority: "urgent", notifyOffsetsMinutes: [15], missed: true, tags: ["trabalho", "equipe"] })}
      backHref="/alguem"
    />,
  );

  const summary = screen.getByRole("region", { name: "Resumo do evento" });
  expect(within(summary).getByText("Urgente")).toBeInTheDocument();
  expect(within(summary).getByText("15 minutos antes")).toBeInTheDocument();
  expect(within(summary).getByText("Não realizado")).toBeInTheDocument();
  expect(within(summary).getByText("equipe")).toBeInTheDocument();
  // 15/04/2026 as 11:00 ja passou em relacao ao relogio do teste.
  expect(within(summary).getByRole("img", { name: "Já aconteceu" })).toBeInTheDocument();
});

test("um evento que ainda não começou é anunciado como tal", () => {
  const event = eventAt({ startedAt: "2026-04-16T10:00:00-03:00", finishedAt: "2026-04-16T11:00:00-03:00" });
  render(<EventDetailScreen event={event} backHref="/alguem" />);

  expect(screen.getByRole("img", { name: "Ainda vai acontecer" })).toBeInTheDocument();
});

test("um evento sem hora de fim que já começou aparece em andamento, com cronômetro", () => {
  const event = eventAt({ startedAt: "2026-04-15T14:30:00-03:00", finishedAt: undefined });
  render(<EventDetailScreen event={event} backHref="/alguem" />);

  expect(screen.getByRole("img", { name: "Acontecendo agora" })).toBeInTheDocument();
  expect(screen.getByText("em andamento")).toBeInTheDocument();
  expect(screen.getByText("30:00")).toBeInTheDocument();
});

test("as tarefas vinculadas aparecem com o status; sem elas, a seção diz que não há", () => {
  const { rerender } = render(<EventDetailScreen event={eventAt()} backHref="/alguem" />);
  expect(screen.getByText("Nenhuma tarefa vinculada.")).toBeInTheDocument();

  rerender(<EventDetailScreen event={eventAt()} tasks={[task, { ...task, id: "tarefa-2", name: "Revisar", status: "done" }]} backHref="/alguem" />);
  expect(screen.getByText("Escrever a ata")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "A fazer" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Concluída" })).toBeInTheDocument();
});

test("sem ações, o menu do evento fica desligado — o estudo visual não promete o que não faz", () => {
  render(<EventDetailScreen event={eventAt()} backHref="/alguem" />);

  expect(screen.getByRole("button", { name: "Mais opções do evento" })).toBeDisabled();
});

test("o menu conduz editar, a anotação de não realizado e excluir", () => {
  const actions = {
    onEdit: vi.fn(),
    onToggleMissed: vi.fn(),
    onDelete: vi.fn(),
    savingMissed: false,
  };
  render(<EventDetailScreen event={eventAt()} backHref="/alguem" actions={actions} />);

  fireEvent.click(screen.getByRole("button", { name: /Editar evento/ }));
  expect(actions.onEdit).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: /Marcar como não realizado/ }));
  expect(actions.onToggleMissed).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: /Excluir evento/ }));
  expect(actions.onDelete).toHaveBeenCalledOnce();
});

test("num evento já anotado, o menu oferece desfazer a anotação", () => {
  const actions = { onEdit: vi.fn(), onToggleMissed: vi.fn(), onDelete: vi.fn(), savingMissed: false };
  render(<EventDetailScreen event={eventAt({ missed: true })} backHref="/alguem" actions={actions} />);

  expect(screen.getByRole("button", { name: /Desmarcar/ })).toBeInTheDocument();
});

test("enquanto a anotação salva, o menu não aceita um segundo clique", () => {
  const actions = { onEdit: vi.fn(), onToggleMissed: vi.fn(), onDelete: vi.fn(), savingMissed: true };
  render(<EventDetailScreen event={eventAt()} backHref="/alguem" actions={actions} />);

  expect(screen.getByRole("button", { name: /Marcar como não realizado/ })).toBeDisabled();
});

test("o conteúdo do tipo entra como mais uma seção, sem mexer no esqueleto", () => {
  const event = eventAt({
    primaryItemId: "meal-item",
    items: [
      {
        id: "meal-item",
        position: 0,
        type: "meal",
        schemaVersion: 1,
        isPrimary: true,
        data: {
          name: "Almoço",
          description: "",
          foodItems: [],
          totals: {
            totalCaloriesKcal: 530,
            totalProteinGrams: 38,
            totalCarbohydrateGrams: 54,
            totalFatGrams: 18,
            totalFiberGrams: 7,
          },
        },
      },
    ],
  });
  render(<EventDetailScreen event={event} backHref="/alguem" />);

  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings).toEqual(["Descrição", "Refeição", "Tarefas", "Notas"]);
  expect(screen.getByText("530")).toBeInTheDocument();
});
