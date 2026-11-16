import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { eventFixture } from "@/test/fake-api/events";
import { TaskRequestsSection } from "./TaskRequestsSection";

test("mostra o pedido que criou o evento em 'Criado por', com link para o detalhe dele", () => {
  const task = eventFixture({
    id: "ev-1",
    requests: [{ id: "req-1", name: "crie um almoço amanhã", relation: "generates", at: "2026-11-14T15:00:00.000Z" }],
  });
  render(<TaskRequestsSection userId="u1" task={task} />);

  const region = screen.getByRole("region", { name: "Pedidos" });
  const created = within(region).getByRole("list", { name: "Criado por" });
  expect(within(created).getByRole("link", { name: /crie um almoço amanhã/ })).toHaveAttribute("href", "/u1/eventos/req-1");
  expect(within(region).queryByRole("list", { name: "Atualizado por" })).not.toBeInTheDocument();
});

test("cada pedido que alterou o evento depois aparece em 'Atualizado por', do mais antigo ao mais novo", () => {
  const task = eventFixture({
    id: "ev-1",
    requests: [
      { id: "req-1", name: "crie um almoço", relation: "generates", at: "2026-11-14T10:00:00.000Z" },
      { id: "req-2", name: "mude para 13h", relation: "updates", at: "2026-11-14T12:00:00.000Z" },
      { id: "req-3", name: "adicione arroz", relation: "updates", at: "2026-11-14T13:00:00.000Z" },
    ],
  });
  render(<TaskRequestsSection userId="u1" task={task} />);

  const updated = screen.getByRole("list", { name: "Atualizado por" });
  expect(within(updated).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/u1/eventos/req-2", "/u1/eventos/req-3"]);
  expect(within(screen.getByRole("list", { name: "Criado por" })).getAllByRole("link")).toHaveLength(1);
});

test("evento que nenhum pedido tocou não mostra a seção", () => {
  render(<TaskRequestsSection userId="u1" task={eventFixture({ id: "ev-1" })} />);

  expect(screen.queryByRole("region", { name: "Pedidos" })).not.toBeInTheDocument();
});
