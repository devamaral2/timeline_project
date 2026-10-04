import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import { MarkdownEditor, type MarkdownEditorMode } from "./MarkdownEditor";
import { MarkdownView } from "./MarkdownView";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState<MarkdownEditorMode>("write");
  return <MarkdownEditor id="texto" value={value} onChange={setValue} mode={mode} onModeChange={setMode} />;
}

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;

test("renderiza o markdown: títulos, ênfase, listas, tarefas, citação, código e tabela", () => {
  render(
    <MarkdownView
      source={["# Título", "## Seção", "**forte** e *suave* e ~~velho~~", "- [x] feito", "- [ ] a fazer", "1. um", "> citação", "`código`", "", "| a | b |", "|---|---|", "| 1 | 2 |"].join("\n")}
    />,
  );

  expect(screen.getByRole("heading", { level: 2, name: "Título" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Seção" })).toBeInTheDocument();
  expect(screen.getByText("forte").tagName).toBe("STRONG");
  expect(screen.getByText("suave").tagName).toBe("EM");
  expect(screen.getByText("velho").tagName).toBe("DEL");
  expect(screen.getByRole("checkbox", { name: "Feito" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "A fazer" })).not.toBeChecked();
  expect(screen.getByText("citação").closest("blockquote")).not.toBeNull();
  expect(screen.getByText("código").tagName).toBe("CODE");
  expect(screen.getByRole("table")).toBeInTheDocument();
});

test("links externos abrem em outra aba e HTML cru e imagens não são interpretados", () => {
  const { container } = render(
    <MarkdownView source={'[site](https://exemplo.dev) <script>alert(1)</script> ![logo](https://track.dev/p.png) [x](javascript:alert(1))'} />,
  );

  expect(screen.getByRole("link", { name: "site" })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: "site" })).toHaveAttribute("rel", "noopener noreferrer");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("logo")).toBeInTheDocument();
  expect(container.querySelector('a[href^="javascript"]')).toBeNull();
});

test("a visualização acompanha o que se digita no modo dividido", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Dividido" }));

  fireEvent.change(textarea(), { target: { value: "## Compras\n- pão" } });

  expect(screen.getByRole("heading", { level: 2, name: "Compras" })).toBeInTheDocument();
  expect(screen.getByRole("listitem")).toHaveTextContent("pão");
});

test("Visualizar esconde o texto-fonte e Escrever o traz de volta", () => {
  render(<Harness initial="**oi**" />);

  fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText("oi").tagName).toBe("STRONG");

  fireEvent.click(screen.getByRole("button", { name: "Escrever" }));
  expect(textarea()).toHaveValue("**oi**");
});

test("a visualização vazia avisa que não há nada para ver", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));

  expect(screen.getByText("Nada para visualizar ainda.")).toBeInTheDocument();
});

test("Enter continua a lista e põe o cursor no novo item", () => {
  render(<Harness initial="- pão" />);
  textarea().setSelectionRange(5, 5);

  fireEvent.keyDown(textarea(), { key: "Enter" });

  expect(textarea()).toHaveValue("- pão\n- ");
  expect(textarea().selectionStart).toBe(8);
});

test("Ctrl+B envolve a seleção em negrito e Ctrl+E abre a visualização", () => {
  render(<Harness initial="um dois" />);
  textarea().setSelectionRange(3, 7);

  fireEvent.keyDown(textarea(), { key: "b", ctrlKey: true });
  expect(textarea()).toHaveValue("um **dois**");

  fireEvent.keyDown(textarea(), { key: "e", ctrlKey: true });
  expect(screen.queryByRole("textbox")).toBeNull();
});
