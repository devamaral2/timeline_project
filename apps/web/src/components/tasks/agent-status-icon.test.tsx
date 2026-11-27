import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentTaskStatus } from "@repo/contracts";
import { agentTaskStatusSchema } from "@repo/contracts/schemas";
import { AgentStatusIcon } from "./agent-status-icon";

const AGENT_TASK_STATUSES: readonly AgentTaskStatus[] = agentTaskStatusSchema.options;

function drawn(status: AgentTaskStatus) {
  render(<AgentStatusIcon status={status} />);
  return screen.getByRole("img");
}

const attr = (element: Element | null, name: string) => element?.getAttribute(name);

describe("AgentStatusIcon", () => {
  it("existe um ícone para cada um dos onze status", () => {
    expect(AGENT_TASK_STATUSES).toHaveLength(11);
  });

  it.each(AGENT_TASK_STATUSES.map((status) => [status] as const))(
    "%s é um svg só, na grade de 20, com o quadrado de 18, raio 5, e nome acessível de agente",
    (status) => {
      const svg = drawn(status);

      expect(svg.tagName.toLowerCase()).toBe("svg");
      expect(attr(svg, "viewBox")).toBe("0 0 20 20");
      expect(attr(svg, "aria-label")).toMatch(/^Agente, /);
      const square = svg.querySelector("rect");
      expect(attr(square, "x")).toBe("1");
      expect(attr(square, "y")).toBe("1");
      expect(attr(square, "width")).toBe("18");
      expect(attr(square, "height")).toBe("18");
      expect(attr(square, "rx")).toBe("5");
      expect(attr(svg, "data-status")).toBe(status);
    },
  );

  it("não usa cor, borda nem estilo em linha: a cor sai do status no CSS", () => {
    for (const status of AGENT_TASK_STATUSES) {
      const { container, unmount } = render(<AgentStatusIcon status={status} />);
      expect(container.querySelectorAll("[style], [fill^='#'], [stroke^='#']")).toHaveLength(0);
      unmount();
    }
  });

  it("queued: um ponto de raio 1,75 no centro", () => {
    const svg = drawn("queued");

    const dot = svg.querySelector("circle");
    expect([attr(dot, "cx"), attr(dot, "cy"), attr(dot, "r")]).toEqual(["10", "10", "1.75"]);
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
  });

  it("preparing: nada dentro, e o contorno é tracejado", () => {
    const svg = drawn("preparing");

    expect([...svg.children].map((child) => child.tagName.toLowerCase())).toEqual(["rect"]);
    expect(svg.querySelector("rect")?.getAttribute("data-part")).toBe("dashed");
  });

  it("starting: um arco de raio 4,25 que gira, com o contorno a 40%", () => {
    const svg = drawn("starting");

    const arc = svg.querySelector("circle");
    expect([attr(arc, "cx"), attr(arc, "cy"), attr(arc, "r")]).toEqual(["10", "10", "4.25"]);
    expect(arc?.getAttribute("data-part")).toBe("spin");
    expect(svg.querySelector("rect")?.getAttribute("data-part")).toBe("dim");
  });

  it("running: um quadrado cheio de 8, raio 1,5, que pulsa", () => {
    const svg = drawn("running");

    const [, inner] = svg.querySelectorAll("rect");
    expect([attr(inner, "x"), attr(inner, "y"), attr(inner, "width"), attr(inner, "height"), attr(inner, "rx")]).toEqual(["6", "6", "8", "8", "1.5"]);
    expect(inner?.getAttribute("data-part")).toBe("pulse");
  });

  it("waiting: três pontos de raio 1,2 em x 6, 10 e 14", () => {
    const svg = drawn("waiting");

    const dots = [...svg.querySelectorAll("circle")];
    expect(dots.map((dot) => [attr(dot, "cx"), attr(dot, "cy"), attr(dot, "r")])).toEqual([
      ["6", "10", "1.2"],
      ["10", "10", "1.2"],
      ["14", "10", "1.2"],
    ]);
  });

  it("awaiting_transcription: o mesmo quadrado com um anel vazio de raio 3 no centro, só contorno", () => {
    const svg = drawn("awaiting_transcription");

    const ring = svg.querySelector("circle");
    expect([attr(ring, "cx"), attr(ring, "cy"), attr(ring, "r")]).toEqual(["10", "10", "3"]);
    expect(ring?.hasAttribute("data-part")).toBe(false);
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector("rect")?.hasAttribute("data-part")).toBe(false);
    expect(attr(svg, "aria-label")).toBe("Agente, esperando transcrição");
  });

  it("completed: o quadrado cheio com um visto na cor do fundo", () => {
    const svg = drawn("completed");

    expect(svg.querySelector("rect")?.getAttribute("data-part")).toBe("solid");
    expect(svg.querySelector("path")?.getAttribute("data-part")).toBe("tick");
  });

  it.each([
    ["interrupted", "M6.5 10h7"],
    ["cancelled", "m6.8 6.8 6.4 6.4M13.2 6.8l-6.4 6.4"],
    ["rolled_back", "m9.4 6.6-3.4 3.4 3.4 3.4M14 6.6l-3.4 3.4 3.4 3.4"],
  ] as const)("%s: o desenho de dentro é o do canvas", (status, path) => {
    const svg = drawn(status);

    expect(attr(svg.querySelector("path"), "d")).toBe(path);
  });

  it("failed: haste de 5,8 a 10,8 e ponto em 14,1", () => {
    const svg = drawn("failed");

    expect(attr(svg.querySelector("path"), "d")).toBe("M10 5.8v5");
    expect(attr(svg.querySelector("circle"), "cy")).toBe("14.1");
  });

  it("aceita um tamanho, sem mexer na grade", () => {
    render(<AgentStatusIcon status="queued" size={16} />);

    const svg = screen.getByRole("img");
    expect(attr(svg, "width")).toBe("16");
    expect(attr(svg, "viewBox")).toBe("0 0 20 20");
  });
});

describe("agent-status-icon.module.css", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "agent-status-icon.module.css"), "utf8");

  it("para o giro e o pulso quando o sistema pede menos movimento", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reduced).toContain('[data-part="spin"]');
    expect(reduced).toContain('[data-part="pulse"]');
    expect(reduced).toMatch(/animation:\s*none/);
  });

  it.each([
    ["queued", "--muted-foreground"],
    ["preparing", "--muted-foreground"],
    ["starting", "--brand-accent"],
    ["running", "--brand-accent"],
    ["waiting", "--warning"],
    ["awaiting_transcription", "--muted-foreground"],
    ["completed", "--success"],
    ["interrupted", "--warning"],
    ["failed", "--destructive"],
    ["cancelled", "--muted-foreground"],
    ["rolled_back", "--muted-foreground"],
  ])("%s usa o token %s", (status, token) => {
    const rule = css.match(new RegExp(`\\[data-status="${status}"\\][^{]*\\{[^}]*\\}`));

    expect(rule?.[0]).toContain(`var(${token})`);
  });
});
