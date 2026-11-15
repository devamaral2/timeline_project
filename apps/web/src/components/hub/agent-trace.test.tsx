import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { AgentChatTrace } from "@/lib/agent-chat/use-agent-chat";
import type { AgentTraceDto } from "@repo/contracts";
import { AgentTrace, timelineBars, traceDuration } from "./agent-trace";

const START = "2026-11-11T18:17:56.000Z";
const at = (ms: number) => new Date(new Date(START).getTime() + ms).toISOString();

const hermesTrace: AgentTraceDto = {
  route: "hermes",
  status: "done",
  startedAt: START,
  durationMs: 8000,
  fields: [{ label: "Modelo", value: "deepseek-chat" }, { label: "Tokens no total", value: "5.746" }],
  entries: [
    { id: "request", kind: "request", label: "Pedido", summary: "liste os arquivos", status: "done", startedAt: START },
    {
      id: "t1", kind: "thought", label: "Pensou", summary: "Preciso olhar a pasta.", status: "done", startedAt: at(1000),
      sections: [{ title: "Raciocínio", text: "Preciso olhar a pasta.\nDepois respondo." }],
    },
    {
      id: "c1", kind: "tool", label: "Executou um comando", source: "terminal", summary: "ls -la", status: "done",
      startedAt: at(2000), durationMs: 4000,
      fields: [{ label: "Chamada", value: "c1" }],
      sections: [
        { title: "Entrada", text: "ls -la", code: true },
        { title: "Resultado", text: "total 8\nREADME.md", code: true },
      ],
      raw: { started: { event: "tool.started", tool: "terminal" } },
    },
    { id: "c2", kind: "tool", label: "Leu um arquivo", source: "read_file", status: "failed", startedAt: at(6500), durationMs: 500 },
    { id: "answer", kind: "answer", label: "Respondeu", summary: "São dois arquivos.", status: "done", startedAt: at(8000) },
  ],
};

const turn = (extra: Partial<AgentChatTrace> = {}): AgentChatTrace => ({
  id: "m1", request: "liste os arquivos", route: "hermes", running: false, trace: hermesTrace, ...extra,
});

/** A linha do passo na lista (a linha do tempo tem um botao de mesmo nome para cada passo). */
const row = (name: RegExp) => within(screen.getByRole("list", { name: "Passos do pedido" })).getByRole("button", { name });

test("durations read as milliseconds, seconds and minutes", () => {
  expect(traceDuration(412)).toBe("412 ms");
  expect(traceDuration(1234)).toBe("1,2 s");
  expect(traceDuration(65_400)).toBe("1 min 05 s");
});

test("each step falls on the timeline where it happened, in its own lane", () => {
  const { bars, totalMs } = timelineBars(hermesTrace);

  expect(totalMs).toBe(8000);
  expect(bars.map((bar) => [bar.entry.id, bar.lane, bar.left, bar.width])).toEqual([
    ["request", "talk", 0, 0],
    ["t1", "model", 0.125, 0],
    ["c1", "tool", 0.25, 0.5],
    ["c2", "tool", 0.8125, 0.0625],
    ["answer", "talk", 1, 0],
  ]);
});

test("a running step stretches up to now; a step that has not started stays off the timeline", () => {
  const { bars, totalMs } = timelineBars({
    status: "running", startedAt: START, fields: [],
    entries: [
      { id: "r", kind: "routing", label: "Roteamento do pedido", status: "done", startedAt: START, durationMs: 400 },
      { id: "s1", kind: "agent", label: "Criando eventos", status: "running", startedAt: at(100) },
      { id: "s2", kind: "agent", label: "Criando notas", status: "pending" },
    ],
  }, new Date(at(1000)).getTime());

  expect(totalMs).toBe(1000);
  expect(bars.map((bar) => bar.entry.id)).toEqual(["r", "s1"]);
  expect(bars[0]).toMatchObject({ left: 0, width: 0.4 });
  expect(bars[1]).toMatchObject({ left: 0.1, width: 0.9 });
});

test("with no request yet, the tab explains what will appear", () => {
  render(<AgentTrace traces={[]} />);

  expect(within(screen.getByRole("region", { name: "Processo da IA" })).getByText(/O processo de cada pedido aparece aqui/)).toBeInTheDocument();
});

test("a request shows who answered, its totals and every step with its state", () => {
  render(<AgentTrace traces={[turn()]} />);

  const article = within(screen.getByRole("article", { name: "Pedido: liste os arquivos" }));
  expect(article.getByText("Hermes · concluído")).toBeInTheDocument();
  // A duracao aparece nos totais e no fim do eixo da linha do tempo.
  expect(article.getAllByText("8,0 s")).toHaveLength(2);
  expect(article.getByText("deepseek-chat")).toBeInTheDocument();
  expect(article.getByText("5.746")).toBeInTheDocument();

  const steps = within(article.getByRole("list", { name: "Passos do pedido" }));
  expect(steps.getAllByRole("listitem")).toHaveLength(5);
  const tool = steps.getByRole("button", { name: /Executou um comando/ });
  expect(tool).toHaveTextContent("ls -la");
  expect(tool).toHaveTextContent("4,0 s");
  expect(tool).toHaveTextContent("concluído");
  expect(steps.getByRole("button", { name: /Leu um arquivo/ })).toHaveTextContent("falhou");
});

test("opening a step shows its summary; the raw view shows the record the server kept", () => {
  render(<AgentTrace traces={[turn()]} />);
  const tool = row(/Executou um comando/);
  expect(tool).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(tool);

  expect(tool).toHaveAttribute("aria-expanded", "true");
  const detail = within(document.getElementById(tool.getAttribute("aria-controls") ?? "") as HTMLElement);
  expect(detail.getByText("Origem")).toBeInTheDocument();
  expect(detail.getByText("terminal")).toBeInTheDocument();
  expect(detail.getByText("Chamada")).toBeInTheDocument();
  expect(detail.getByText("Entrada")).toBeInTheDocument();
  expect(detail.getByText(/README\.md/)).toBeInTheDocument();

  fireEvent.click(detail.getByRole("button", { name: "Bruto" }));
  expect(detail.getByText(/"event": "tool.started"/)).toBeInTheDocument();
  expect(detail.queryByText("Entrada")).not.toBeInTheDocument();

  // Um passo aberto por vez.
  fireEvent.click(row(/Pensou/));
  expect(tool).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText(/Depois respondo\./)).toBeInTheDocument();
});

test("a bar of the timeline opens the same step as the list", () => {
  render(<AgentTrace traces={[turn()]} />);
  const timeline = within(screen.getByRole("group", { name: "Linha do tempo do pedido, 8,0 s" }));

  fireEvent.click(timeline.getByRole("button", { name: "Executou um comando, 4,0 s" }));

  expect(row(/Executou um comando/)).toHaveAttribute("aria-expanded", "true");
  expect(timeline.getByRole("button", { name: "Executou um comando, 4,0 s" })).toHaveAttribute("aria-pressed", "true");
});

test("while the AI works the request says so; before the first step it waits", () => {
  const { rerender } = render(<AgentTrace traces={[turn({ running: true, trace: null })]} />);
  expect(screen.getByText("Hermes · em andamento")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Esperando o primeiro passo…");

  rerender(<AgentTrace traces={[turn({ running: false, trace: null, route: "steps" })]} />);
  expect(screen.getByText("Assistente · não concluído")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Sem detalhes deste pedido.");
});

test("the text of a step is shown as text, never as markup", () => {
  const trace: AgentTraceDto = {
    ...hermesTrace,
    entries: [{
      id: "t1", kind: "thought", label: "Pensou", status: "done",
      sections: [{ title: "Raciocínio", text: "<img src=x onerror=alert(1)>" }],
    }],
  };
  render(<AgentTrace traces={[turn({ trace })]} />);

  fireEvent.click(row(/Pensou/));

  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(document.querySelector("img")).toBeNull();
});
