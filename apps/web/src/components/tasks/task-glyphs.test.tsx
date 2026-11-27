import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaskKind, TaskPriority } from "@repo/contracts";
import { TaskKindMark } from "./task-kind-mark";
import { TaskPriorityMark } from "./task-priority-mark";
import { TaskStatusGlyph } from "./task-status-glyph";
import { TaskSituationGlyph, situationNames } from "./task-situation";

describe("TaskStatusGlyph", () => {
  it.each([
    ["todo", "A fazer"],
    ["toDefine", "Sem data"],
    ["doing", "Em curso"],
    ["inHold", "Em espera"],
    ["done", "Feito"],
    ["cancel", "Cancelado"],
    ["missed", "Não realizado"],
  ] as const)("nomeia o status de pessoa %s como %s", (status, name) => {
    render(<TaskStatusGlyph actor="human" status={status} />);

    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });

  it("usa o ponto azul com nome 'Só agenda' quando a tarefa de pessoa não tem status", () => {
    render(<TaskStatusGlyph actor="human" status={null} />);

    expect(screen.getByRole("img", { name: "Só agenda" })).toBeInTheDocument();
  });

  it.each([
    ["preparing", "Agente, preparando"],
    ["queued", "Agente, na fila"],
    ["starting", "Agente, iniciando"],
    ["running", "Agente, trabalhando"],
    ["waiting", "Agente, esperando"],
    ["awaiting_transcription", "Agente, esperando transcrição"],
    ["completed", "Agente, concluído"],
    ["interrupted", "Agente, interrompido"],
    ["failed", "Agente, falhou"],
    ["cancelled", "Agente, cancelado"],
    ["rolled_back", "Agente, revertido"],
  ] as const)("nomeia o status de agente %s como %s", (status, name) => {
    render(<TaskStatusGlyph actor="agent" status={status} />);

    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });

  it("é só o desenho: o elemento com o nome é o próprio svg, sem moldura em volta", () => {
    render(<TaskStatusGlyph actor="human" status="todo" />);

    expect(screen.getByRole("img", { name: "A fazer" }).tagName.toLowerCase()).toBe("svg");
  });
});

describe("TaskSituationGlyph", () => {
  it.each([
    ["to_review", "Para revisar"],
    ["reviewed", "Revisada"],
    ["bookmarked", "Guardada"],
  ] as const)("nomeia a situação %s como %s", (situation, name) => {
    render(<TaskSituationGlyph situation={situation} />);

    expect(screen.getByRole("img", { name })).toBeInTheDocument();
    expect(situationNames[situation]).toBe(name);
  });

  it("Revisada leva dois vistos e Guardada um marcador; Para revisar é o círculo vazio do 'A fazer'", () => {
    const { container: review } = render(<TaskSituationGlyph situation="to_review" />);
    const { container: todo } = render(<TaskStatusGlyph actor="human" status="todo" />);
    const { container: done } = render(<TaskSituationGlyph situation="reviewed" />);
    const { container: marked } = render(<TaskSituationGlyph situation="bookmarked" />);

    expect(review.querySelector("svg")?.innerHTML).toBe(todo.querySelector("svg")?.innerHTML);
    expect(done.querySelectorAll("circle")).toHaveLength(1);
    expect(done.querySelector("path")?.getAttribute("d")?.match(/m/gi)).toHaveLength(2);
    expect(marked.querySelector("circle")).toBeNull();
  });
});

describe("TaskKindMark", () => {
  const humanKinds: TaskKind[] = ["common", "meal", "sleep", "training"];
  const agentKinds: TaskKind[] = [
    "request",
    "save_content",
    "save_content_with_transcription",
    "search_request",
    "build_request",
    "inquiry_request",
    "review_request",
    "cron",
    "step",
  ];

  it.each([...humanKinds, ...agentKinds])("escreve o código %s em texto ao lado do ícone", (kind) => {
    const { container } = render(<TaskKindMark kind={kind} />);

    expect(screen.getByText(kind)).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("TaskPriorityMark", () => {
  it.each([
    ["urgent", "Urgente", 4],
    ["high", "Alta", 3],
    ["medium", "Média", 2],
    ["low", "Baixa", 1],
  ] as const satisfies ReadonlyArray<readonly [TaskPriority, string, number]>)(
    "nomeia a prioridade %s como %s e acende %i de 4 barras",
    (priority, label, lit) => {
      const { container } = render(<TaskPriorityMark priority={priority} />);

      expect(screen.getByRole("img", { name: `Prioridade: ${label}` })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(lit);
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(4);
    },
  );
});
