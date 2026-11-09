import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { AiProcessDto } from "@/lib/api/contracts";
import { EntityAiEditBar } from "./EntityAiEditBar";

vi.mock("@/lib/speech/use-speech-recognition", () => ({
  useSpeechRecognition: () => ({ supported: false, listening: false, interim: "", error: null, start: vi.fn(), stop: vi.fn() }),
}));

const done: AiProcessDto = {
  id: "p1", status: "completed", title: "Realizando processos:",
  steps: [{ id: "s1", agent: "event-edit", label: "Editando eventos", status: "succeeded" }],
  entities: [{ kind: "event", id: "e1", name: "Revisão semanal", operation: "update", linkedTo: [] }],
};

beforeEach(() => vi.clearAllMocks());

function setup(props: Partial<React.ComponentProps<typeof EntityAiEditBar>> = {}) {
  const api = { startEdit: vi.fn(async () => ({ processId: "p1" })), get: vi.fn(async () => done) };
  const onEdited = vi.fn();
  render(<EntityAiEditBar userId="u" entityType="event" entityId="e1" onEdited={onEdited} api={api} pollMs={1} {...props} />);
  return { api, onEdited };
}

test("o campo fala do que esta sendo editado e envia o tipo e o id da entidade", async () => {
  const { api, onEdited } = setup();
  const input = screen.getByRole("textbox", { name: "Pedir à IA para editar este evento" });
  expect(input).toHaveAttribute("placeholder", "Peça ao Hermes para editar este evento");

  fireEvent.change(input, { target: { value: "mude para 19h" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(api.startEdit).toHaveBeenCalledWith({ userId: "u", text: "mude para 19h", entityType: "event", entityId: "e1" }));
  await waitFor(() => expect(onEdited).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Pronto")).toBeInTheDocument();
  expect(screen.getByText("Editando eventos")).toBeInTheDocument();
  expect(input).toHaveValue("");
});

test("enviar fica desligado sem texto", () => {
  setup();
  expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
});

test("o placeholder muda por tipo", () => {
  setup({ entityType: "skill_note" });
  expect(screen.getByPlaceholderText("Peça ao Hermes para editar esta skill")).toBeInTheDocument();
});

test("com motivo para desligar, o campo fica desabilitado e mostra o motivo", () => {
  setup({ entityType: "meal_note", disabledReason: "A refeição ainda está sendo gerada." });
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByText("A refeição ainda está sendo gerada.")).toBeInTheDocument();
});

test("pedido recusado devolve o texto ao campo para tentar de novo", async () => {
  const { api } = setup();
  api.startEdit.mockRejectedValueOnce(new Error("rede"));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "pedido" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => expect(input).toHaveValue("pedido"));
  expect(await screen.findByText("Não deu certo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fechar resultado" }));
  expect(screen.queryByText("Não deu certo")).not.toBeInTheDocument();
});
