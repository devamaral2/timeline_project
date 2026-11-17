import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ChatAnswer } from "./chat-answer";

const ANSWER = [
  "O estado atual é NOT_AUTHENTICATED, com token previsto em /opt/data/google_token.json.",
  'Uma decisão antes: quais serviços você quer? Diga "só gmail" ou "com calendar e drive" e eu gero a URL.',
  "Os passos:",
  "1. Abra https://console.cloud.google.com/projectselector2/home/dashboard e crie um projeto.",
  "2. Em https://console.cloud.google.com/apis/library habilite as APIs.",
].join("\n\n");

test("a resposta sai como prosa formatada: código, rótulo, passos e endereços encurtados", () => {
  const { container } = render(<ChatAnswer text={ANSWER} />);

  expect([...container.querySelectorAll("code")].map((code) => code.textContent)).toEqual([
    "NOT_AUTHENTICATED",
    "/opt/data/google_token.json",
  ]);
  expect(screen.getByText("Uma decisão antes:").tagName).toBe("STRONG");
  expect(screen.getByText("Os passos")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);

  const link = screen.getByRole("link", { name: /projectselector2/ });
  expect(link).toHaveTextContent("console.cloud.google.com/projectselector2…");
  expect(link).toHaveAttribute("href", "https://console.cloud.google.com/projectselector2/home/dashboard");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("as alternativas viram botões que enviam a escolha como o agente a escreveu", () => {
  const onChoose = vi.fn();
  render(<ChatAnswer text={ANSWER} onChoose={onChoose} />);

  const choices = within(screen.getByRole("group", { name: "Escolha uma resposta" }));
  expect(choices.getAllByRole("button").map((button) => button.textContent)).toEqual(["Só gmail", "Com calendar e drive"]);
  fireEvent.click(choices.getByRole("button", { name: "Com calendar e drive" }));
  expect(onChoose).toHaveBeenCalledWith("com calendar e drive");
});

test("sem onChoose os botões ficam desligados", () => {
  render(<ChatAnswer text={ANSWER} />);

  expect(screen.getByRole("group", { name: "Escolha uma resposta" })).toBeDisabled();
});

test("texto simples continua texto, sem botões, e HTML não é interpretado", () => {
  const { container } = render(<ChatAnswer text={"Criei a tarefa.\n\n<b>oi</b>"} />);

  expect(screen.getByText("Criei a tarefa.")).toBeInTheDocument();
  expect(screen.queryByRole("group")).not.toBeInTheDocument();
  expect(container.querySelector("b")).toBeNull();
});
