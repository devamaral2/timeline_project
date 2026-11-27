import type { RequestDto } from "@repo/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { agentFailureText } from "@/lib/agent-chat/use-agent-chat";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { type AgentFileRow, agentFileFixture, agentFilesArea } from "@/test/fake-api/agent-files";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/user-1/notas/skill-1",
}));

vi.mock("@/lib/speech/use-speech-recognition", () => ({
  useSpeechRecognition: () => ({ supported: false, listening: false, interim: "", error: null, start: vi.fn(), stop: vi.fn() }),
}));

// O acompanhamento do pedido relê a cada batida: o intervalo vai para 1 ms nos testes.
vi.mock("@/lib/tasks/agent-request-model", async (original) => ({
  ...(await original<typeof import("@/lib/tasks/agent-request-model")>()),
  AGENT_REQUEST_POLL_MS: 1,
}));

// A tela troca o authedFetch pela API falsa: a rede inteira passa por ela.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { NoteDetailScreen } = await import("./NoteDetailScreen");

const SKILL = "hermes/skills/pesquisa/SKILL.md";
const TEXT = "---\ndescription: Pesquisa na web\n---\n# Pesquisa\n\nPasso 1: buscar fontes";
const TEXT_EDITED = "---\ndescription: Pesquisa na web\n---\n# Pesquisa\n\nPasso 1: ler o contrato";
const FIELD = "Pedir ao Hermes uma edição neste arquivo";

let api: FakeApi;

function install({ owner, hermes }: { owner: boolean; hermes: "on" | "off" }) {
  api = createFakeApi({
    areas: [artifactsArea, agentFilesArea({ owner, hermes }), requestsArea({ hermes })],
    seed: {
      agentFiles: [agentFileFixture({ path: SKILL, text: TEXT })],
      artifacts: [
        artifactFixture({
          id: "skill-1",
          name: "Pesquisa",
          type: "skill",
          data: { path: SKILL, hash: "1f2e3d4c".padEnd(64, "0"), missing: false, description: "Pesquisa na web" },
        }),
      ],
    },
  });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
});

function editCall() {
  return api.calls.find((call) => call.pathname === "/api/ai/config/edit-request");
}

/** O pedido que o campo abriu: a API falsa guarda os pedidos em `requests`. */
function openedRequest(): string {
  const [id] = [...api.store.table<RequestDto>("requests").keys()];
  if (!id) throw new Error("O campo ainda não abriu pedido.");
  return id;
}

async function sendRequest(text: string) {
  fireEvent.change(await screen.findByRole("textbox", { name: FIELD }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
}

test("o dono manda o pedido: o campo acompanha o andamento, mostra a resposta e relê o arquivo", async () => {
  install({ owner: true, hermes: "on" });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  await sendRequest("Troque o passo 1 por ler o contrato");
  await waitFor(() => expect(editCall()?.body).toEqual({
    path: SKILL,
    request: "Troque o passo 1 por ler o contrato",
    clientMessageId: expect.any(String),
  }));

  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), { status: "running", progress: "Lendo o arquivo…" });
  expect(await screen.findByText("Lendo o arquivo…")).toBeInTheDocument();

  // O Hermes editou o arquivo e terminou: a tela mostra a resposta e relê o texto atual.
  api.store.table<AgentFileRow>("agentFiles").set(SKILL, { id: SKILL, path: SKILL, text: TEXT_EDITED, missing: false });
  advanceRequest(api, openedRequest(), { status: "completed", message: "Troquei o passo 1." });
  expect(await screen.findByText("Troquei o passo 1.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Texto do arquivo").textContent).toContain("ler o contrato"));
  expect(api.calls.filter((call) => call.pathname === "/api/ai/config/file").length).toBeGreaterThan(1);
});

test("um pedido que falha mostra o motivo traduzido pelo código", async () => {
  install({ owner: true, hermes: "on" });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  await sendRequest("Troque o passo 1");
  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), { status: "failed", errorCode: "unavailable" });
  expect(await screen.findByText(agentFailureText("unavailable"))).toBeInTheDocument();
});

test("com o Hermes desligado, o envio diz isso e o campo some", async () => {
  install({ owner: true, hermes: "off" });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  await sendRequest("Troque o passo 1");
  expect(await screen.findByText("O Hermes está desligado neste servidor.")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: FIELD })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("quem não é o dono não recebe o campo", async () => {
  install({ owner: false, hermes: "on" });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  await screen.findByRole("article", { name: "Arquivo do Hermes" });
  // Depois que a leitura do texto responde 403, o campo não está mais na tela.
  await waitFor(() => expect(screen.queryByText("Lendo o arquivo…")).not.toBeInTheDocument());
  expect(screen.queryByRole("textbox", { name: FIELD })).not.toBeInTheDocument();
});
