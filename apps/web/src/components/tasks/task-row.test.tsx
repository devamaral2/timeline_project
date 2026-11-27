import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TaskCardDto } from "@repo/contracts";
import { TaskRow } from "./task-row";

const NOW = new Date("2026-09-14T10:00:00-03:00");

function cardOf(overrides: Partial<TaskCardDto>): TaskCardDto {
  return {
    id: "ev-1",
    actor: "human",
    kind: "common",
    priority: "medium",
    name: "Revisar proposta",
    description: "",
    project: { id: "project-1", name: "personal", personal: true },
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("TaskRow", () => {
  it("mostra o glifo, o título, o tipo, o quando, as tags e a duração de uma tarefa de pessoa", () => {
    const card = cardOf({
      status: "todo",
      kind: "common",
      startedAt: "2026-09-14T09:00:00-03:00",
      estimatedFinishAt: "2026-09-14T10:30:00-03:00",
      tags: ["trabalho"],
    });

    render(<TaskRow card={card} userId="user-1" now={NOW} />);

    expect(screen.getByRole("button", { name: "A fazer. Mudar status de “Revisar proposta”" })).toBeInTheDocument();
    expect(screen.getByText("Revisar proposta")).toBeInTheDocument();
    expect(screen.getByText("common")).toBeInTheDocument();
    expect(screen.getByText("Hoje, 09:00")).toBeInTheDocument();
    expect(screen.getByText("#trabalho")).toBeInTheDocument();
    expect(screen.getByText("1h30")).toBeInTheDocument();
  });

  it("mostra a linha do projeto, com a marca e o nome, entre o título e a linha do tipo, igual para pessoa e agente", () => {
    const project = { id: "p-tp", name: "timeline_project", personal: false };
    for (const overrides of [
      { actor: "human" as const, status: "todo" as const, kind: "common" as const },
      { actor: "agent" as const, status: "completed" as const, kind: "request" as const },
    ]) {
      const { container, unmount } = render(
        <TaskRow card={cardOf({ ...overrides, project, startedAt: "2026-09-14T09:00:00-03:00" })} userId="user-1" now={NOW} />,
      );

      const line = container.querySelector("[data-project-line]");
      expect(line).toHaveTextContent("TPtimeline_project");
      const title = screen.getByText("Revisar proposta");
      const kind = screen.getByText(overrides.kind);
      expect(title.compareDocumentPosition(line as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect((line as Element).compareDocumentPosition(kind) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      unmount();
    }
  });

  it("mostra a linha do projeto também quando ele é o personal", () => {
    const { container } = render(<TaskRow card={cardOf({ status: "todo" })} userId="user-1" now={NOW} />);

    expect(container.querySelector("[data-project-line]")).toHaveTextContent("PEpersonal");
  });

  it("mostra a tarefa de referência como ponto 'Só agenda', com glifo que é botão", () => {
    const card = cardOf({
      id: "ev-2",
      kind: "meal",
      name: "Almoço no escritório",
      startedAt: "2026-09-14T12:30:00-03:00",
      estimatedFinishAt: "2026-09-14T13:30:00-03:00",
    });

    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    expect(
      screen.getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" }),
    ).toBeInTheDocument();
    expect(screen.getByText("meal")).toBeInTheDocument();
    expect(screen.getByText("Hoje, 12:30")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
    expect(container.querySelector("[data-agent-mark]")).not.toBeInTheDocument();
  });

  it("mostra a tarefa de agente com glifo inerte à esquerda, tempo decorrido no quando e sem o robô", () => {
    const card = cardOf({
      id: "ev-3",
      actor: "agent",
      kind: "request",
      status: "running",
      name: "Pesquisar voos para novembro",
      startedAt: "2026-09-14T09:48:00-03:00",
    });

    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Pesquisar voos para novembro")).toBeInTheDocument();
    expect(screen.getByText("request")).toBeInTheDocument();
    expect(screen.getByText("há 12 min")).toBeInTheDocument();
    expect(container.querySelector('[data-actor="agent"]')).toBeInTheDocument();
    expect(container.querySelector("[data-agent-mark]")).not.toBeInTheDocument();
    const lead = container.querySelector("[data-row-lead]");
    expect(lead).toBeInTheDocument();
    expect(lead?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(lead?.querySelector("button, a")).toBeNull();
  });

  it.each([
    ["preparing", "Preparando", "Agente, preparando"],
    ["queued", "Na fila", "Agente, na fila"],
    ["starting", "Iniciando", "Agente, iniciando"],
    ["running", "Trabalhando", "Agente, trabalhando"],
    ["waiting", "Esperando", "Agente, esperando"],
    ["completed", "Concluído", "Agente, concluído"],
    ["interrupted", "Interrompido", "Agente, interrompido"],
    ["failed", "Falhou", "Agente, falhou"],
    ["cancelled", "Cancelado", "Agente, cancelado"],
    ["rolled_back", "Revertido", "Agente, revertido"],
  ] as const)("põe o nome %s e o ícone quadrado do status à direita da linha de agente", (status, label, name) => {
    const { container } = render(
      <TaskRow card={cardOf({ actor: "agent", kind: "request", status, startedAt: "2026-09-14T09:48:00-03:00" })} userId="user-1" now={NOW} />,
    );

    const side = container.querySelector("[data-row-side]") as HTMLElement;
    expect(side).toBeInTheDocument();
    expect(within(side).getByText(label)).toBeInTheDocument();
    const icon = within(side).getByRole("img", { name });
    expect(icon).toHaveAttribute("viewBox", "0 0 20 20");
    // O nome fica à esquerda do ícone.
    const text = within(side).getByText(label);
    expect(text.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O status do agente não abre escolha nenhuma.
    expect(within(side).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["anthropic", "Anthropic"],
    ["openai", "OpenAI"],
    ["openrouter", "OpenRouter"],
  ] as const)("mostra o símbolo do provedor %s abaixo do ícone quando o cartão traz a escolha do pedido", (provider, name) => {
    const card = cardOf({
      actor: "agent",
      kind: "request",
      status: "completed",
      model: { provider, model: "um-modelo", effort: "high" },
    });

    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    const side = container.querySelector("[data-row-side]") as HTMLElement;
    const mark = within(side).getByRole("img", { name });
    const icon = within(side).getByRole("img", { name: "Agente, concluído" });
    expect(icon.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("não mostra símbolo de provedor quando o cartão não traz a escolha do pedido", () => {
    const card = cardOf({ actor: "agent", kind: "request", status: "completed" });

    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    const side = container.querySelector("[data-row-side]") as HTMLElement;
    expect(within(side).getAllByRole("img")).toHaveLength(1);
  });

  it("a linha de pessoa não muda: sem lado direito de status e sem símbolo de provedor", () => {
    const { container } = render(<TaskRow card={cardOf({ status: "done" })} userId="user-1" now={NOW} />);

    expect(container.querySelector("[data-row-side]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-row-lead]")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feito. Mudar status de “Revisar proposta”" })).toBeInTheDocument();
  });

  it("a hierarquia não muda a linha: subtarefa em espera mostra só o quando", () => {
    const card = cardOf({
      status: "inHold",
      kind: "common",
      name: "Renovar passaporte",
      startedAt: "2026-09-14T09:00:00-03:00",
      parentTaskId: "ev-9",
    });

    render(<TaskRow card={card} userId="user-1" now={NOW} />);

    expect(screen.getByText("Hoje, 09:00")).toBeInTheDocument();
    expect(screen.queryByText(/Espera por/)).not.toBeInTheDocument();
  });

  it("marca o quando de um a fazer já passado como atrasado", () => {
    const card = cardOf({ status: "todo", startedAt: "2026-09-13T09:00:00-03:00" });

    render(<TaskRow card={card} userId="user-1" now={NOW} />);

    const when = screen.getByText("Era ontem");
    expect(when).toHaveAttribute("data-overdue", "true");
  });

  it("chama onStatusClick com o cartão ao tocar no glifo de tarefa de pessoa", () => {
    const onStatusClick = vi.fn();
    const card = cardOf({ status: "todo" });

    render(<TaskRow card={card} userId="user-1" now={NOW} onStatusClick={onStatusClick} />);

    fireEvent.click(screen.getByRole("button", { name: /Mudar status de “Revisar proposta”/ }));

    expect(onStatusClick).toHaveBeenCalledWith(card, expect.any(HTMLElement));
  });

  it("leva ao detalhe da tarefa ao tocar no resto da linha", () => {
    render(<TaskRow card={cardOf({ status: "todo" })} userId="user-1" now={NOW} />);

    const link = screen.getByRole("link", { name: /Revisar proposta/ });
    expect(link).toHaveAttribute("href", "/user-1/tarefas/ev-1");
    expect(within(link).getByText("Revisar proposta")).toBeInTheDocument();
  });
});
