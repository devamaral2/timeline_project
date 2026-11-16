import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EventKind, EventPriority } from "@repo/contracts";
import { EventKindMark } from "./event-kind-mark";
import { EventPriorityMark } from "./event-priority-mark";
import { EventStatusGlyph } from "./event-status-glyph";

describe("EventStatusGlyph", () => {
  it.each([
    ["todo", "A fazer"],
    ["toDefine", "Sem data"],
    ["doing", "Em curso"],
    ["inHold", "Em espera"],
    ["done", "Feito"],
    ["cancel", "Cancelado"],
    ["missed", "Não realizado"],
  ] as const)("nomeia o status de pessoa %s como %s", (status, name) => {
    render(<EventStatusGlyph actor="human" status={status} />);

    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });

  it("usa o ponto azul com nome 'Só agenda' quando o evento de pessoa não tem status", () => {
    render(<EventStatusGlyph actor="human" status={null} />);

    expect(screen.getByRole("img", { name: "Só agenda" })).toBeInTheDocument();
  });

  it.each([
    ["queued", "Agente, na fila"],
    ["running", "Agente, executando"],
    ["waiting", "Agente, aguardando você"],
    ["done", "Agente, feito"],
    ["failed", "Agente, falhou"],
    ["cancel", "Agente, cancelado"],
  ] as const)("nomeia o status de agente %s como %s", (status, name) => {
    render(<EventStatusGlyph actor="agent" status={status} />);

    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });

  it("é só o desenho: o elemento com o nome é o próprio svg, sem moldura em volta", () => {
    render(<EventStatusGlyph actor="human" status="todo" />);

    expect(screen.getByRole("img", { name: "A fazer" }).tagName.toLowerCase()).toBe("svg");
  });
});

describe("EventKindMark", () => {
  const humanKinds: EventKind[] = ["common", "meal", "sleep", "training"];
  const agentKinds: EventKind[] = [
    "request",
    "search_request",
    "build_request",
    "inquiry_request",
    "review_request",
    "cron",
    "step",
  ];

  it.each([...humanKinds, ...agentKinds])("escreve o código %s em texto ao lado do ícone", (kind) => {
    const { container } = render(<EventKindMark kind={kind} />);

    expect(screen.getByText(kind)).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EventPriorityMark", () => {
  it.each([
    ["urgent", "Urgente", 4],
    ["high", "Alta", 3],
    ["medium", "Média", 2],
    ["low", "Baixa", 1],
  ] as const satisfies ReadonlyArray<readonly [EventPriority, string, number]>)(
    "nomeia a prioridade %s como %s e acende %i de 4 barras",
    (priority, label, lit) => {
      const { container } = render(<EventPriorityMark priority={priority} />);

      expect(screen.getByRole("img", { name: `Prioridade: ${label}` })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(lit);
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(4);
    },
  );
});
