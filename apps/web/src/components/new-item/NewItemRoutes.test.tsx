import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { eventsArea } from "@/test/fake-api/events";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// A tela troca o authedFetch pela API falsa: a rede inteira passa por ela.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { EditNoteRoute, NewNoteRoute } = await import("./NewItemRoutes");

let api: FakeApi;

function install(seed: Parameters<typeof createFakeApi>[0]["seed"] = {}) {
  api = createFakeApi({ areas: [artifactsArea, eventsArea], seed });
  net.authedFetch.mockImplementation(api.authedFetch);
}

const NOTE = artifactFixture({
  id: "art-1",
  name: "Ideias",
  data: { body: "Ideias\nPrimeiro ponto" },
  tags: ["trabalho"],
  revision: 2,
});

beforeEach(() => {
  net.authedFetch.mockReset();
  replace.mockReset();
  push.mockReset();
});

test("criar nota envia um artefato de texto com o nome e o conteúdo", async () => {
  install();
  render(<NewNoteRoute userId="user-1" />);

  fireEvent.change(screen.getByLabelText("Nome da nota"), { target: { value: "Ideias" } });
  fireEvent.change(screen.getByLabelText("Conteúdo da nota"), { target: { value: "Ideias\nPrimeiro ponto" } });
  fireEvent.click(screen.getByRole("button", { name: "Criar nota" }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/user-1\/notas\/.+/)));
  const post = api.calls.find((call) => call.method === "POST");
  expect(post).toMatchObject({
    pathname: "/api/artifacts",
    body: { type: "text", name: "Ideias", data: { body: "Ideias\nPrimeiro ponto" } },
  });
  expect(post?.idempotencyKey).toEqual(expect.any(String));
  expect([...api.store.table<StoredArtifact>("artifacts").values()]).toHaveLength(1);
});

test("criar alimento envia só o texto do que foi comido e abre o alimento, que nasce pendente", async () => {
  install();
  render(<NewNoteRoute userId="user-1" />);

  fireEvent.click(screen.getByRole("button", { name: "Alimento" }));
  // O formulário de nota some: só o campo do que foi comido e o botão de alimento ficam.
  expect(screen.queryByLabelText("Conteúdo da nota")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("O que você comeu"), { target: { value: "  Arroz, feijão e salada  " } });
  fireEvent.click(screen.getByRole("button", { name: "Criar alimento" }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/user-1\/notas\/.+/)));
  const post = api.calls.find((call) => call.method === "POST");
  expect(post).toMatchObject({ pathname: "/api/artifacts", body: { type: "food", data: { inputText: "Arroz, feijão e salada" } } });
  expect(post?.body).toEqual({ type: "food", data: { inputText: "Arroz, feijão e salada" } });
  expect(post?.idempotencyKey).toEqual(expect.any(String));
  const [artifact] = [...api.store.table<StoredArtifact>("artifacts").values()];
  expect(artifact).toMatchObject({ type: "food", data: { generation: { status: "pending" } } });
});

test("alimento sem texto não envia nada e pede o que foi comido", async () => {
  install();
  render(<NewNoteRoute userId="user-1" />);

  fireEvent.click(screen.getByRole("button", { name: "Alimento" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar alimento" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o que você comeu.");
  expect(api.calls.some((call) => call.method === "POST")).toBe(false);
});

test("tentar salvar de novo depois de uma falha reenvia a mesma chave e não cria duas notas", async () => {
  install();
  api.failNext("POST", "/api/artifacts", 503);
  render(<NewNoteRoute userId="user-1" />);

  fireEvent.change(screen.getByLabelText("Conteúdo da nota"), { target: { value: "Uma ideia" } });
  fireEvent.click(screen.getByRole("button", { name: "Criar nota" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível criar a nota.");

  fireEvent.click(screen.getByRole("button", { name: "Criar nota" }));
  await waitFor(() => expect(replace).toHaveBeenCalled());

  const posts = api.calls.filter((call) => call.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0].idempotencyKey).toEqual(posts[1].idempotencyKey);
  expect([...api.store.table<StoredArtifact>("artifacts").values()]).toHaveLength(1);
});

test("editar envia a revisão lida, o conteúdo inteiro e as tags", async () => {
  install({ artifacts: [NOTE] });
  render(<EditNoteRoute userId="user-1" noteId="art-1" />);

  fireEvent.change(await screen.findByLabelText("Conteúdo da nota"), { target: { value: "Ideias\nSegundo ponto" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas/art-1"));
  const patch = api.calls.find((call) => call.method === "PATCH");
  expect(patch).toMatchObject({
    pathname: "/api/artifacts/art-1",
    body: { expectedRevision: 2, name: "Ideias", tags: ["trabalho"], type: "text", data: { body: "Ideias\nSegundo ponto" } },
  });
});

test("revisão desatualizada avisa, mantém o texto digitado e a próxima tentativa usa a revisão nova", async () => {
  install({ artifacts: [NOTE] });
  render(<EditNoteRoute userId="user-1" noteId="art-1" />);

  const body = await screen.findByLabelText("Conteúdo da nota");
  // Outra pessoa salvou a nota depois da leitura desta tela.
  const stored = api.store.table<StoredArtifact>("artifacts").get("art-1");
  if (stored) stored.revision = 3;

  fireEvent.change(body, { target: { value: "Meu texto" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Esta nota mudou em outro lugar");
  expect(screen.getByLabelText("Conteúdo da nota")).toHaveValue("Meu texto");
  expect(replace).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas/art-1"));
  const patches = api.calls.filter((call) => call.method === "PATCH");
  expect(patches.map((call) => (call.body as { expectedRevision: number }).expectedRevision)).toEqual([2, 3]);
  expect(patches[1].body).toMatchObject({ data: { body: "Meu texto" } });
});
