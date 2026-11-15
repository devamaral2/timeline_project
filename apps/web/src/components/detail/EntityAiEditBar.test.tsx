import type { RequestDto } from "@repo/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { EntityAiEditBar } from "./EntityAiEditBar";

vi.mock("@/lib/speech/use-speech-recognition", () => ({
  useSpeechRecognition: () => ({ supported: false, listening: false, interim: "", error: null, start: vi.fn(), stop: vi.fn() }),
}));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

beforeEach(() => {
  api = createFakeApi({ areas: [requestsArea()] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
});

function setup(props: Partial<React.ComponentProps<typeof EntityAiEditBar>> = {}) {
  const onEdited = vi.fn();
  render(<EntityAiEditBar userId="user-1" entityType="event" entityId="e1" onEdited={onEdited} pollMs={1} {...props} />);
  return { onEdited };
}

/** O pedido que o campo abriu: a API falsa guarda os pedidos em `requests`. */
function openedRequest(): string {
  const [id] = [...api.store.table<RequestDto>("requests").keys()];
  if (!id) throw new Error("O campo ainda não abriu pedido.");
  return id;
}

function editCall() {
  return api.calls.find((call) => call.pathname === "/api/requests/edit");
}

test("um evento: o pedido leva o tipo e o id do evento, mostra o andamento e recarrega ao terminar", async () => {
  const { onEdited } = setup();
  const input = screen.getByRole("textbox", { name: "Pedir à IA para editar este evento" });
  expect(input).toHaveAttribute("placeholder", "Peça uma mudança neste evento");

  fireEvent.change(input, { target: { value: "mude para 19h" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(editCall()).toBeDefined());
  expect(editCall()?.body).toEqual({ userId: "user-1", text: "mude para 19h", entityType: "event", entityId: "e1" });

  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), {
    status: "running",
    progress: "Trocando o horário",
    steps: [{ id: "s1", agent: "event-edit", label: "Editando eventos", status: "running" }],
  });
  expect(await screen.findByText("Trocando o horário")).toBeInTheDocument();

  advanceRequest(api, openedRequest(), {
    status: "done",
    message: "Troquei para 19h.",
    steps: [{ id: "s1", agent: "event-edit", label: "Editando eventos", status: "done" }],
    entities: [{ kind: "event", id: "e1", name: "Revisão semanal", operation: "update", linkedTo: [] }],
  });
  expect(await screen.findByText("Pronto")).toBeInTheDocument();
  expect(screen.getByText("Editando eventos")).toBeInTheDocument();
  expect(screen.getByText("Troquei para 19h.")).toBeInTheDocument();
  await waitFor(() => expect(onEdited).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox", { name: "Pedir à IA para editar este evento" })).toHaveValue("");
});

test("um artefato de texto: o pedido leva o tipo artifact e o id da nota", async () => {
  setup({ entityType: "artifact", entityId: "art-1" });
  const input = screen.getByRole("textbox", { name: "Pedir à IA para editar esta nota" });
  expect(input).toHaveAttribute("placeholder", "Peça uma mudança nesta nota");

  fireEvent.change(input, { target: { value: "resuma em duas linhas" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(editCall()).toBeDefined());
  expect(editCall()?.body).toEqual({ userId: "user-1", text: "resuma em duas linhas", entityType: "artifact", entityId: "art-1" });
});

test("enviar fica desligado sem texto", () => {
  setup();
  expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
});

test("com motivo para desligar, o campo fica desabilitado e mostra o motivo", () => {
  setup({ entityType: "food_artifact", disabledReason: "Aguarde a geração da refeição para editar a nota." });
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByText("Aguarde a geração da refeição para editar a nota.")).toBeInTheDocument();
});

test("um pedido que falha mostra a mensagem do código do erro e não recarrega", async () => {
  const { onEdited } = setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "pedido" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), { status: "failed", errorCode: "unavailable" });

  expect(await screen.findByText("Não deu certo")).toBeInTheDocument();
  expect(screen.getByText("A IA está indisponível agora. Tente de novo em instantes.")).toBeInTheDocument();
  expect(onEdited).not.toHaveBeenCalled();
});

test("pedido recusado devolve o texto ao campo para tentar de novo, e Fechar limpa o resultado", async () => {
  api.failNext("POST", "/api/requests/edit", 503);
  setup();
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "pedido" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(input).toHaveValue("pedido"));
  expect(await screen.findByText("Não deu certo")).toBeInTheDocument();
  expect(screen.getByText("A IA está indisponível agora. Tente de novo em instantes.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fechar resultado" }));
  expect(screen.queryByText("Não deu certo")).not.toBeInTheDocument();
});
