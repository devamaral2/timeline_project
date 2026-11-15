import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { DetailOrigin, LinkGroup, LinkRow } from "./detail-parts";

test("a origem só existe quando a entidade traz o rastro, e abre para mostrar os passos", () => {
  const { rerender } = render(<DetailOrigin id="nota" />);
  expect(screen.queryByRole("region", { name: "Origem" })).not.toBeInTheDocument();

  rerender(
    <DetailOrigin
      id="nota"
      origin={{
        title: "Criada pelo Hermes",
        subtitle: "Pedido no chat · hoje, 13:05",
        quote: "Almocei macarrão",
        steps: [{ id: "1", label: "Criou a nota", tool: "create_note", seconds: 0.7 }],
        idempotencyKey: "refeicao:1",
      }}
    />,
  );

  const toggle = screen.getByRole("button", { name: /Criada pelo Hermes/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list", { name: "Passos do Hermes" })).not.toBeInTheDocument();

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const steps = screen.getByRole("list", { name: "Passos do Hermes" });
  expect(within(steps).getByText("Criou a nota")).toBeInTheDocument();
  expect(within(steps).getByText("create_note")).toBeInTheDocument();
  expect(within(steps).getByText(/0,7 s/)).toBeInTheDocument();
  expect(screen.getByText("refeicao:1")).toBeInTheDocument();
  expect(screen.getByText("“Almocei macarrão”")).toBeInTheDocument();
});

test("um grupo de vínculos mostra a contagem e as linhas, abertas ou só de leitura", () => {
  render(
    <LinkGroup id="grupo" title="Notas vinculadas" count={2}>
      <LinkRow kind="note" icon={null} title="Pauta" sub="Nota · agenda" href="/u/notas/1" />
      <LinkRow kind="note" icon={null} title="Solta" sub="Nota" />
    </LinkGroup>,
  );

  const group = screen.getByRole("group", { name: /Notas vinculadas/ });
  expect(within(group).getByText("2")).toBeInTheDocument();
  expect(within(group).getByRole("link", { name: /Pauta/ })).toHaveAttribute("href", "/u/notas/1");
  expect(within(group).getAllByRole("link")).toHaveLength(1);
});
