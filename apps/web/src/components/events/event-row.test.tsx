import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EventCardDto } from "@repo/contracts";
import { EventRow } from "./event-row";

const NOW = new Date("2026-09-14T10:00:00-03:00");

function cardOf(overrides: Partial<EventCardDto>): EventCardDto {
  return {
    id: "ev-1",
    actor: "human",
    kind: "common",
    priority: "medium",
    name: "Revisar proposta",
    description: "",
    location: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    previousEventIds: [],
    revision: 1,
    ...overrides,
  };
}

describe("EventRow", () => {
  it("mostra o glifo, o título, o tipo, o quando, as tags e a duração de um evento de pessoa", () => {
    const card = cardOf({
      status: "todo",
      kind: "common",
      startedAt: "2026-09-14T09:00:00-03:00",
      estimatedFinishAt: "2026-09-14T10:30:00-03:00",
      tags: ["trabalho"],
    });

    render(<EventRow card={card} userId="user-1" now={NOW} />);

    expect(screen.getByRole("button", { name: "A fazer. Mudar status de “Revisar proposta”" })).toBeInTheDocument();
    expect(screen.getByText("Revisar proposta")).toBeInTheDocument();
    expect(screen.getByText("common")).toBeInTheDocument();
    expect(screen.getByText("Hoje, 09:00")).toBeInTheDocument();
    expect(screen.getByText("#trabalho")).toBeInTheDocument();
    expect(screen.getByText("1h30")).toBeInTheDocument();
  });

  it("mostra o evento de referência como ponto 'Só agenda', com glifo que é botão", () => {
    const card = cardOf({
      id: "ev-2",
      kind: "meal",
      name: "Almoço no escritório",
      startedAt: "2026-09-14T12:30:00-03:00",
      estimatedFinishAt: "2026-09-14T13:30:00-03:00",
    });

    const { container } = render(<EventRow card={card} userId="user-1" now={NOW} />);

    expect(
      screen.getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" }),
    ).toBeInTheDocument();
    expect(screen.getByText("meal")).toBeInTheDocument();
    expect(screen.getByText("Hoje, 12:30")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
    expect(container.querySelector("[data-agent-mark]")).not.toBeInTheDocument();
  });

  it("mostra o evento de agente com o robô de assinatura, glifo que não é botão e tempo decorrido no quando", () => {
    const card = cardOf({
      id: "ev-3",
      actor: "agent",
      kind: "request",
      status: "running",
      name: "Pesquisar voos para novembro",
      startedAt: "2026-09-14T09:48:00-03:00",
    });

    const { container } = render(<EventRow card={card} userId="user-1" now={NOW} />);

    expect(screen.getByRole("img", { name: "Agente, executando" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Pesquisar voos para novembro")).toBeInTheDocument();
    expect(screen.getByText("request")).toBeInTheDocument();
    expect(screen.getByText("há 12 min")).toBeInTheDocument();
    expect(container.querySelector('[data-actor="agent"]')).toBeInTheDocument();
    expect(container.querySelector("[data-agent-mark]")).toBeInTheDocument();
  });

  it("a sequência não muda a linha: evento em espera que se segue a outro mostra só o quando", () => {
    const card = cardOf({
      status: "inHold",
      kind: "common",
      name: "Renovar passaporte",
      startedAt: "2026-09-14T09:00:00-03:00",
      previousEventIds: ["ev-9"],
    });

    render(<EventRow card={card} userId="user-1" now={NOW} />);

    expect(screen.getByText("Hoje, 09:00")).toBeInTheDocument();
    expect(screen.queryByText(/Espera por/)).not.toBeInTheDocument();
  });

  it("marca o quando de um a fazer já passado como atrasado", () => {
    const card = cardOf({ status: "todo", startedAt: "2026-09-13T09:00:00-03:00" });

    render(<EventRow card={card} userId="user-1" now={NOW} />);

    const when = screen.getByText("Era ontem");
    expect(when).toHaveAttribute("data-overdue", "true");
  });

  it("chama onStatusClick com o cartão ao tocar no glifo de evento de pessoa", () => {
    const onStatusClick = vi.fn();
    const card = cardOf({ status: "todo" });

    render(<EventRow card={card} userId="user-1" now={NOW} onStatusClick={onStatusClick} />);

    fireEvent.click(screen.getByRole("button", { name: /Mudar status de “Revisar proposta”/ }));

    expect(onStatusClick).toHaveBeenCalledWith(card, expect.any(HTMLElement));
  });

  it("leva ao detalhe do evento ao tocar no resto da linha", () => {
    render(<EventRow card={cardOf({ status: "todo" })} userId="user-1" now={NOW} />);

    const link = screen.getByRole("link", { name: /Revisar proposta/ });
    expect(link).toHaveAttribute("href", "/user-1/eventos/ev-1");
    expect(within(link).getByText("Revisar proposta")).toBeInTheDocument();
  });
});
