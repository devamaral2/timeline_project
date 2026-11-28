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
    project: { id: "project-1", name: "diario", personal: true },
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

  it("põe a marca do projeto, sem o nome escrito, na ponta da segunda linha, igual para pessoa e agente", () => {
    const project = { id: "p-tp", name: "timeline_project", personal: false };
    for (const overrides of [
      { actor: "human" as const, status: "todo" as const, kind: "common" as const },
      { actor: "agent" as const, status: "completed" as const, kind: "request" as const },
    ]) {
      const { container, unmount } = render(
        <TaskRow card={cardOf({ ...overrides, project, startedAt: "2026-09-14T09:00:00-03:00" })} userId="user-1" now={NOW} />,
      );

      const meta = container.querySelector("[data-row-meta]") as HTMLElement;
      const mark = within(meta).getByRole("img", { name: "timeline_project" });
      expect(mark).toHaveTextContent("TP");
      expect(mark.closest("[data-row-marks]")).toBeInTheDocument();
      expect(container.querySelector("[data-project-line]")).not.toBeInTheDocument();
      expect(screen.queryByText("timeline_project")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("mostra a marca do projeto também quando ele é o personal", () => {
    const { container } = render(<TaskRow card={cardOf({ status: "todo" })} userId="user-1" now={NOW} />);

    expect(within(container.querySelector("[data-row-marks]") as HTMLElement).getByRole("img", { name: "diario" })).toHaveTextContent("D");
  });

  it("a linha de pessoa leva a duração no alto à direita e, embaixo dela, a prioridade à esquerda da marca do projeto", () => {
    const { container } = render(
      <TaskRow
        card={cardOf({ status: "todo", priority: "high", startedAt: "2026-09-14T09:00:00-03:00", estimatedFinishAt: "2026-09-14T10:30:00-03:00" })}
        userId="user-1"
        now={NOW}
      />,
    );

    const marks = container.querySelector("[data-row-marks]") as HTMLElement;
    const priority = within(marks).getByRole("img", { name: "Prioridade: Alta" });
    const project = within(marks).getByRole("img", { name: "diario" });
    expect(priority.compareDocumentPosition(project) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(marks.closest("[data-row-meta]")).toBeInTheDocument();
    expect(container.querySelector("[data-row-head] [data-row-aside]")).toHaveTextContent("1h30");
    expect(screen.getAllByText("1h30")).toHaveLength(1);
  });

  it("a linha de pessoa sem duração deixa o alto à direita vazio e segue com a prioridade e o projeto embaixo", () => {
    const { container } = render(<TaskRow card={cardOf({ status: "todo", startedAt: undefined, estimatedFinishAt: undefined })} userId="user-1" now={NOW} />);

    expect(container.querySelector("[data-row-aside]")).not.toBeInTheDocument();
    expect(within(container.querySelector("[data-row-meta] [data-row-marks]") as HTMLElement).getAllByRole("img")).toHaveLength(2);
  });

  it("a linha de agente não mostra prioridade, e o provedor fica à esquerda da marca do projeto", () => {
    const card = cardOf({ actor: "agent", kind: "request", status: "completed", model: { provider: "anthropic", model: "um-modelo", effort: "high" } });
    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    const marks = container.querySelector("[data-row-meta] [data-row-marks]") as HTMLElement;
    expect(screen.queryByRole("img", { name: /Prioridade/ })).not.toBeInTheDocument();
    const provider = within(marks).getByRole("img", { name: "Anthropic" });
    const project = within(marks).getByRole("img", { name: "diario" });
    expect(provider.compareDocumentPosition(project) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("as tags ficam numa linha própria, abaixo da linha do tipo e do quando", () => {
    const { container } = render(
      <TaskRow card={cardOf({ status: "todo", tags: ["trabalho"], startedAt: "2026-09-14T09:00:00-03:00" })} userId="user-1" now={NOW} />,
    );

    const meta = container.querySelector("[data-row-meta]") as HTMLElement;
    const tags = container.querySelector("[data-row-tags]") as HTMLElement;
    expect(within(meta).queryByText("#trabalho")).not.toBeInTheDocument();
    expect(within(tags).getByText("#trabalho")).toBeInTheDocument();
    expect(meta.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem tags não há linha de tags", () => {
    const { container } = render(<TaskRow card={cardOf({ status: "todo", tags: [] })} userId="user-1" now={NOW} />);

    expect(container.querySelector("[data-row-tags]")).not.toBeInTheDocument();
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
  ] as const)("põe o nome %s do status e o ícone quadrado, na ponta, no alto à direita da tarefa de agente", (status, label, name) => {
    const { container } = render(
      <TaskRow card={cardOf({ actor: "agent", kind: "request", status, startedAt: "2026-09-14T09:48:00-03:00" })} userId="user-1" now={NOW} />,
    );

    const aside = container.querySelector("[data-row-head] [data-row-aside]") as HTMLElement;
    const text = within(aside).getByText(label);
    const icon = within(aside).getByRole("img", { name });
    expect(icon).toHaveAttribute("viewBox", "0 0 20 20");
    // O ícone fica na ponta direita, depois do nome.
    expect(text.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O status do agente não abre escolha nenhuma.
    expect(within(aside).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["anthropic", "Anthropic"],
    ["openai", "OpenAI"],
    ["openrouter", "OpenRouter"],
  ] as const)("mostra o símbolo do provedor %s na segunda linha quando o cartão traz a escolha do pedido", (provider, name) => {
    const card = cardOf({
      actor: "agent",
      kind: "request",
      status: "completed",
      model: { provider, model: "um-modelo", effort: "high" },
    });

    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    expect(within(container.querySelector("[data-row-marks]") as HTMLElement).getByRole("img", { name })).toBeInTheDocument();
  });

  it("não mostra símbolo de provedor quando o cartão não traz a escolha do pedido", () => {
    const card = cardOf({ actor: "agent", kind: "request", status: "completed" });

    const { container } = render(<TaskRow card={card} userId="user-1" now={NOW} />);

    const marks = container.querySelector("[data-row-marks]") as HTMLElement;
    expect(within(marks).getAllByRole("img").map((img) => img.getAttribute("aria-label"))).toEqual(["diario"]);
  });

  it("a linha de pessoa não leva status de agente nem símbolo de provedor", () => {
    const { container } = render(<TaskRow card={cardOf({ status: "done" })} userId="user-1" now={NOW} />);

    const marks = container.querySelector("[data-row-marks]") as HTMLElement;
    expect(within(marks).getAllByRole("img").map((img) => img.getAttribute("aria-label"))).toEqual(["Prioridade: Média", "diario"]);
    expect(screen.queryByRole("img", { name: /^Agente,/ })).not.toBeInTheDocument();
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

  describe("situação da tarefa de agente", () => {
    const finished = (overrides: Partial<TaskCardDto> = {}) =>
      cardOf({
        id: "ag-1", actor: "agent", kind: "request", status: "completed", situation: "to_review", name: "Pesquisar voos",
        startedAt: "2026-09-14T09:48:00-03:00", ...overrides,
      });

    it("o glifo da esquerda mostra a situação e o toque pede a escolha à tela, ancorada nele", () => {
      const onSituationClick = vi.fn();
      const card = finished();
      render(<TaskRow card={card} userId="user-1" now={NOW} onSituationClick={onSituationClick} />);

      const glyph = screen.getByRole("button", { name: "Para revisar. Mudar situação de “Pesquisar voos”" });
      expect(glyph).toHaveAttribute("aria-haspopup", "dialog");

      fireEvent.click(glyph);

      expect(onSituationClick).toHaveBeenCalledWith(card, glyph);
    });

    it.each([
      ["to_review", "Para revisar"],
      ["reviewed", "Revisada"],
      ["bookmarked", "Guardada"],
    ] as const)("a situação %s tem o nome acessível %s", (situation, name) => {
      render(<TaskRow card={finished({ situation })} userId="user-1" now={NOW} onSituationClick={vi.fn()} />);

      expect(screen.getByRole("button", { name: `${name}. Mudar situação de “Pesquisar voos”` })).toBeInTheDocument();
    });

    it("o status do agente fica no alto à direita, e o glifo da esquerda é só a situação", () => {
      const { container } = render(<TaskRow card={finished()} userId="user-1" now={NOW} onSituationClick={vi.fn()} />);

      expect(screen.getAllByRole("img", { name: "Agente, concluído" })).toHaveLength(1);
      expect(container.querySelector("[data-row-head]")).toContainElement(screen.getByRole("img", { name: "Agente, concluído" }));
      expect(container.querySelector("[data-row-lead]")).toBeNull();
    });

    it("a tarefa de agente esperando você e a execução agendada têm um ponto inerte, sem botão", () => {
      for (const card of [finished({ status: "waiting", situation: undefined }), finished({ kind: "cron", situation: undefined })]) {
        const { container, unmount } = render(<TaskRow card={card} userId="user-1" now={NOW} onSituationClick={vi.fn()} />);

        expect(container.querySelector("[data-row-lead]")).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        unmount();
      }
    });

    it("sem quem trate a situação (a agenda), o lugar fica com o ponto inerte e sem botão", () => {
      const { container } = render(<TaskRow card={finished()} userId="user-1" now={NOW} />);

      expect(container.querySelector("[data-row-lead]")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
