import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DetailOrigin, LinkGroup, LinkRow, TaskLinkRow } from "./detail-parts";

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

test("a tarefa vinculada troca de status pelo círculo, sem abrir a tarefa", () => {
  const onStatusChange = vi.fn();
  render(
    <ul>
      <TaskLinkRow name="Fazer a lista" status="todo" sub="Tarefa · hoje" href="/u/tarefas/1" onStatusChange={onStatusChange} />
    </ul>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Status: A fazer. Trocar status de Fazer a lista" }));
  const listbox = screen.getByRole("listbox", { name: "Status da tarefa" });
  fireEvent.click(within(listbox).getByRole("option", { name: "Concluída" }));

  expect(onStatusChange).toHaveBeenCalledWith("done");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Fazer a lista/ })).toHaveAttribute("href", "/u/tarefas/1");
});
