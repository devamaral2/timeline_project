import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { setField } from "@/components/edit/edit-test-helpers";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

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
  api = createFakeApi({ areas: [artifactsArea, tasksArea], seed });
  net.authedFetch.mockImplementation(api.authedFetch);
}

const NOTE = artifactFixture({
  id: "art-1",
  name: "Ideias",
  data: { body: "Ideias\nPrimeiro ponto" },
  tags: ["trabalho"],
  revision: 2,
});

/** A criação escolhe entre nota e alimento no seletor de tipo. */
function chooseFood() {
  setField("Tipo", "food");
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

/** Liga uma tarefa pelo "+": abre o modal de seleção e escolhe pelo nome. */
async function linkTask(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar tarefa" }));
  fireEvent.click(await screen.findByRole("button", { name: `Escolher “${name}”` }));
}

beforeEach(() => {
  net.authedFetch.mockReset();
  replace.mockReset();
  push.mockReset();
});

test("criar nota envia um artefato de texto com o nome e o conteúdo", async () => {
  install();
  render(<NewNoteRoute userId="user-1" />);

  expect(screen.getByRole("heading", { level: 1, name: "Novo artefato" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nome do artefato"), { target: { value: "Ideias" } });
  fireEvent.change(screen.getByLabelText("Conteúdo da nota"), { target: { value: "Ideias\nPrimeiro ponto" } });
  save();

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

  chooseFood();
  // O formulário de nota some: fica só o campo do que foi comido, sem nome e sem tags.
  expect(screen.queryByLabelText("Conteúdo da nota")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Nome do artefato")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("O que você comeu"), { target: { value: "  Arroz, feijão e salada  " } });
  save();

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

  chooseFood();
  save();

  expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o que você comeu.");
  expect(api.calls.some((call) => call.method === "POST")).toBe(false);
});

test("tentar salvar de novo depois de uma falha reenvia a mesma chave e não cria duas notas", async () => {
  install();
  api.failNext("POST", "/api/artifacts", 503);
  render(<NewNoteRoute userId="user-1" />);

  fireEvent.change(screen.getByLabelText("Conteúdo da nota"), { target: { value: "Uma ideia" } });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível criar a nota.");

  save();
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
  save();

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
  save();

  expect(await screen.findByRole("alert")).toHaveTextContent("Esta nota mudou em outro lugar");
  expect(screen.getByLabelText("Conteúdo da nota")).toHaveValue("Meu texto");
  expect(replace).not.toHaveBeenCalled();

  save();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas/art-1"));
  const patches = api.calls.filter((call) => call.method === "PATCH");
  expect(patches.map((call) => (call.body as { expectedRevision: number }).expectedRevision)).toEqual([2, 3]);
  expect(patches[1].body).toMatchObject({ data: { body: "Meu texto" } });
});

const DINNER = taskFixture({ id: "ev-1", name: "Jantar leve", kind: "meal", startedAt: "2026-11-14T20:00:00-03:00" });
const GYM = taskFixture({ id: "ev-2", name: "Treino de peito", kind: "training", startedAt: "2026-11-15T07:00:00-03:00" });

test("o + de Tarefas abre o modal de seleção, e a nota criada já nasce ligada à tarefa escolhida", async () => {
  install({ tasks: [DINNER, GYM] });
  render(<NewNoteRoute userId="user-1" />);

  fireEvent.change(screen.getByLabelText("Conteúdo da nota"), { target: { value: "Receita do jantar" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar tarefa" }));
  expect(screen.getByRole("dialog", { name: "Tarefas" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tarefa para ligar" }), { target: { value: "Jantar" } });
  fireEvent.click(await screen.findByRole("button", { name: "Escolher “Jantar leve”" }));

  // Escolher fecha o modal e põe a tarefa na lista do formulário.
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Tarefas ligadas" })).getByText("Jantar leve")).toBeInTheDocument();
  save();

  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/user-1\/notas\/.+/)));
  expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ type: "text", taskIds: ["ev-1"] });
});

test("quem já está na lista não é oferecido de novo no modal", async () => {
  install({ tasks: [DINNER, GYM] });
  render(<NewNoteRoute userId="user-1" />);

  await linkTask("Jantar leve");
  fireEvent.click(screen.getByRole("button", { name: "Adicionar tarefa" }));

  expect(await screen.findByRole("button", { name: "Escolher “Treino de peito”" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Escolher “Jantar leve”" })).not.toBeInTheDocument();
});

test("editar mostra as tarefas ligadas; ligar outra e desligar uma manda a lista de tarefas que fica", async () => {
  install({ tasks: [DINNER, GYM], artifacts: [artifactFixture({ ...NOTE, revision: 2, links: [{ taskId: "ev-1", relation: "uses" }] })] });
  render(<EditNoteRoute userId="user-1" noteId="art-1" />);

  expect(await screen.findByRole("heading", { level: 1, name: "Editar artefato" })).toBeInTheDocument();
  const linked = screen.getByRole("list", { name: "Tarefas ligadas" });
  expect(within(linked).getByText("Jantar leve")).toBeInTheDocument();

  await linkTask("Treino de peito");
  fireEvent.click(screen.getByRole("button", { name: "Desligar da tarefa “Jantar leve”" }));
  save();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas/art-1"));
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ expectedRevision: 2, taskIds: ["ev-2"] });
});

test("sem mexer nas tarefas, a edição não manda a lista de tarefas", async () => {
  install({ tasks: [DINNER], artifacts: [artifactFixture({ ...NOTE, links: [{ taskId: "ev-1", relation: "uses" }] })] });
  render(<EditNoteRoute userId="user-1" noteId="art-1" />);

  fireEvent.change(await screen.findByLabelText("Conteúdo da nota"), { target: { value: "Outro texto" } });
  save();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas/art-1"));
  expect(api.calls.find((call) => call.method === "PATCH")?.body).not.toHaveProperty("taskIds");
});

test("Descartar volta para a lista na criação e para a leitura na edição, sem gravar nada", async () => {
  install({ artifacts: [NOTE] });
  const created = render(<NewNoteRoute userId="user-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  expect(replace).toHaveBeenLastCalledWith("/user-1/notas");
  created.unmount();

  render(<EditNoteRoute userId="user-1" noteId="art-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
  expect(replace).toHaveBeenLastCalledWith("/user-1/notas/art-1");
  expect(api.calls.some((call) => call.method !== "GET")).toBe(false);
});

test("um artefato que não é nota de texto própria não se edita aqui", async () => {
  // Uma nota do catálogo global: só se lê.
  install({ artifacts: [artifactFixture({ id: "art-9", name: "Guia", global: true, data: { body: "Guia" } })] });
  render(<EditNoteRoute userId="user-1" noteId="art-9" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Este artefato não se edita aqui.");
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
});

test.each(["news", "email_summary", "youtube_transcript"] as const)("editar um artefato %s usa o editor da nota e salva com o tipo dele", async (type) => {
  install({ artifacts: [artifactFixture({ id: "art-livre", name: "Resumo do dia", type, data: { body: "Resumo do dia\nPrimeira versão" }, tags: ["leitura"], revision: 4 })] });
  render(<EditNoteRoute userId="user-1" noteId="art-livre" />);

  expect(await screen.findByRole("heading", { level: 1, name: "Editar artefato" })).toBeInTheDocument();
  // O tipo aparece só como leitura: não há seletor de tipo na edição.
  expect(screen.getByText(type)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Tipo/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /Tipo/ })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Nome do artefato"), { target: { value: "Resumo da manhã" } });
  fireEvent.change(screen.getByLabelText("Conteúdo da nota"), { target: { value: "Versão corrigida" } });
  save();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas/art-livre"));
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
    expectedRevision: 4,
    name: "Resumo da manhã",
    type,
    data: { body: "Versão corrigida" },
  });
});

test("criar pela tela continua criando nota ou alimento: os tipos novos não são oferecidos", async () => {
  install({});
  render(<NewNoteRoute userId="user-1" />);

  expect(await screen.findByRole("heading", { level: 1, name: "Novo artefato" })).toBeInTheDocument();
  for (const label of ["Notícias", "Resumo de e-mail", "Transcrição"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
});
