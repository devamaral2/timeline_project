import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { transcriptionArea } from "@/test/fake-api/transcription";
import { TaskAddVideo } from "./TaskAddVideo";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;
const posts = () => api.calls.filter((call) => call.pathname === "/api/tasks/transcription-requests");

beforeEach(() => {
  api = createFakeApi({ areas: [transcriptionArea] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
});

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar vídeo" }));
  return screen.getByRole("textbox", { name: "Link do vídeo do YouTube" });
}

function submit(link: string) {
  fireEvent.change(open(), { target: { value: link } });
  fireEvent.click(screen.getByRole("button", { name: "Pedir transcrição" }));
}

test("o botão abre o campo do link; cancelar o fecha sem pedir nada", () => {
  render(<TaskAddVideo onRequested={vi.fn()} />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

  open();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Adicionar vídeo" })).toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});

test("com um link de vídeo, cria o pedido de transcrição, avisa que entrou na fila e relê a tarefa", async () => {
  const onRequested = vi.fn();
  render(<TaskAddVideo onRequested={onRequested} />);
  submit("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ");

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("O vídeo entrou na fila de transcrição."));
  expect(posts().map((call) => call.body)).toEqual([{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }]);
  expect(onRequested).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("pedir de novo o mesmo vídeo diz que ele já estava na fila", async () => {
  render(<TaskAddVideo onRequested={vi.fn()} />);
  submit("https://youtu.be/dQw4w9WgXcQ");
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("entrou na fila"));

  submit("https://youtu.be/dQw4w9WgXcQ");
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Esse vídeo já estava na fila de transcrição."));
});

test.each(["https://www.youtube.com/@canal", "https://www.youtube.com/playlist?list=PL123", "https://exemplo.dev/video", "isto não é um link", ""])(
  "o link %j é recusado com uma mensagem clara, sem chamar a API",
  (link) => {
    const onRequested = vi.fn();
    render(<TaskAddVideo onRequested={onRequested} />);
    submit(link);

    expect(screen.getByRole("alert")).toHaveTextContent("Esse link não é de um vídeo do YouTube.");
    expect(screen.getByRole("textbox", { name: "Link do vídeo do YouTube" })).toHaveAttribute("aria-invalid", "true");
    expect(posts()).toHaveLength(0);
    expect(onRequested).not.toHaveBeenCalled();
  },
);

test("digitar de novo tira o aviso de link inválido", () => {
  render(<TaskAddVideo onRequested={vi.fn()} />);
  submit("https://www.youtube.com/@canal");
  expect(screen.getByRole("alert")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: "Link do vídeo do YouTube" }), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a API recusar o link mostra o mesmo aviso, e uma falha de rede pede para tentar de novo", async () => {
  const onRequested = vi.fn();
  render(<TaskAddVideo onRequested={onRequested} />);
  api.failNext("POST", "/api/tasks/transcription-requests", 400);
  submit("https://youtu.be/dQw4w9WgXcQ");
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Esse link não é de um vídeo do YouTube."));

  api.failNext("POST", "/api/tasks/transcription-requests", 500);
  fireEvent.click(screen.getByRole("button", { name: "Pedir transcrição" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível pedir a transcrição. Tente novamente."));
  expect(onRequested).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Link do vídeo do YouTube" })).toHaveValue("https://youtu.be/dQw4w9WgXcQ");
});
