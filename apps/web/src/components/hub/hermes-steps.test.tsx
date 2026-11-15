import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { HermesStep } from "@/lib/agent-chat/hermes-steps";
import { HermesSteps } from "./hermes-steps";

const steps: HermesStep[] = [
  { id: "t1", kind: "thought", label: "Pensou", detail: "Preciso ler a documentação do provedor.", status: "done" },
  { id: "c1", kind: "tool", label: "Pesquisou na web", detail: "opencode-go provider hermes agent", status: "done" },
  { id: "c2", kind: "tool", label: "Executou um comando", detail: "ls -la", status: "running" },
  { id: "c3", kind: "tool", label: "Leu um arquivo", status: "failed" },
];

test("mostra cada ferramenta com o que o Hermes mostrou e o estado em texto", () => {
  render(<HermesSteps steps={steps} running />);

  const list = within(screen.getByRole("region", { name: "Passos do Hermes" }));
  expect(list.getByText("Pesquisou na web")).toBeInTheDocument();
  expect(list.getByText("opencode-go provider hermes agent")).toBeInTheDocument();
  expect(list.getByText("ls -la")).toBeInTheDocument();
  expect(list.getAllByText("concluído")).toHaveLength(1);
  expect(list.getByText("em andamento")).toBeInTheDocument();
  expect(list.getByText("falhou")).toBeInTheDocument();
});

test("o pensamento vem recolhido e abre para ler", () => {
  render(<HermesSteps steps={steps} running={false} />);

  const summary = screen.getByText("Pensou");
  const details = summary.closest("details");
  expect(details).not.toHaveAttribute("open");

  fireEvent.click(summary);

  expect(details).toHaveAttribute("open");
  expect(screen.getByText("Preciso ler a documentação do provedor.")).toBeInTheDocument();
});

test("marca se o Hermes ainda esta trabalhando", () => {
  const { rerender } = render(<HermesSteps steps={steps} running />);
  expect(screen.getByRole("region", { name: "Passos do Hermes" })).toHaveAttribute("data-running", "true");

  rerender(<HermesSteps steps={steps} running={false} />);
  expect(screen.getByRole("region", { name: "Passos do Hermes" })).toHaveAttribute("data-running", "false");
});
