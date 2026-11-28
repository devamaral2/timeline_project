import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";
import { requestsArea } from "@/test/fake-api/requests";
import { PullToRefresh } from "@/components/shell/pull-to-refresh";
import { pullDown } from "@/test/pull-down";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
  usePathname: () => "/user-1/notas/art-1",
}));

// A tela troca o authedFetch pela API falsa: a rede inteira passa por ela.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { NoteDetailScreen } = await import("./NoteDetailScreen");

type Seed = Parameters<typeof createFakeApi>[0]["seed"];

let api: FakeApi;

function install(seed: Seed = {}) {
  api = createFakeApi({ areas: [artifactsArea, tasksArea, requestsArea()], seed });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderArtifact(id: string) {
  render(<NoteDetailScreen userId="user-1" noteId={id} />);
}

const FOOD = {
  description: "Arroz e feijão",
  items: [
    { id: "i1", name: "Arroz", portion: "2 colheres", approximateWeightGrams: 120, caloriesKcal: 150, macronutrients: { carbohydratesGrams: 33, proteinsGrams: 3, totalFatGrams: 0, fiberGrams: 0 } },
  ],
  totals: { totalCaloriesKcal: 412, totalProteinGrams: 18, totalCarbohydrateGrams: 60, totalFatGrams: 9, totalFiberGrams: 7 },
  recipe: { source: "user", ingredients: [{ name: "Arroz", quantity: "2 xícaras" }], steps: ["Cozinhar o arroz."] },
  generation: { status: "completed" },
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  net.authedFetch.mockReset();
  replace.mockReset();
  push.mockReset();
});

test("mostra título, tipo, tags, o registro e o texto de uma nota própria", async () => {
  install({
    artifacts: [
      artifactFixture({
        id: "art-1",
        name: "Ideias para a proposta",
        data: { body: "Ideias para a proposta\nComeçar pelo problema do cliente.\n\n## Pontos para a reunião\n- Mostrar o cronograma" },
        tags: ["trabalho"],
        revision: 2,
        createdAt: "2026-09-12T09:00:00-03:00",
        updatedAt: "2026-09-13T21:12:00-03:00",
      }),
    ],
  });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 1, name: "Ideias para a proposta" })).toBeInTheDocument();
  expect(screen.getByText("Nota")).toBeInTheDocument();
  expect(screen.getByText("Artefato")).toBeInTheDocument();
  expect(screen.getByText("#trabalho")).toBeInTheDocument();
  expect(screen.getByText("Começar pelo problema do cliente.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Pontos para a reunião" })).toBeInTheDocument();
  const registro = screen.getByRole("region", { name: "Registro" });
  expect(within(registro).getByText("12 set., 09:00")).toBeInTheDocument();
  expect(within(registro).getByText("ontem, 21:12")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para Artefatos" })).toHaveAttribute("href", "/user-1/notas");
  expect(api.calls.at(-1)).toMatchObject({ method: "GET", pathname: "/api/artifacts/art-1" });
});

test("lista as tarefas em que o artefato aparece, com a relação, e cada uma abre o detalhe da tarefa", async () => {
  install({
    tasks: [
      taskFixture({ id: "ev-9", name: "Academia", kind: "training", startedAt: "2026-09-14T07:00:00-03:00", estimatedFinishAt: "2026-09-14T08:00:00-03:00" }),
      taskFixture({ id: "ev-1", name: "Almoço", kind: "meal", startedAt: "2026-09-13T12:00:00-03:00" }),
    ],
    artifacts: [
      artifactFixture({
        id: "art-1",
        name: "Arroz e feijão",
        type: "food",
        data: FOOD,
        links: [{ taskId: "ev-9", relation: "uses" }, { taskId: "ev-1", relation: "creates" }],
      }),
    ],
  });
  renderArtifact("art-1");

  const tarefas = await screen.findByRole("region", { name: "Tarefas" });
  const academia = within(tarefas).getByRole("link", { name: /Academia/ });
  expect(academia).toHaveAttribute("href", "/user-1/tarefas/ev-9");
  expect(academia).toHaveTextContent("uses");
  expect(within(tarefas).getByRole("link", { name: /Almoço/ })).toHaveAttribute("href", "/user-1/tarefas/ev-1");
  expect(within(tarefas).getByRole("link", { name: /Almoço/ })).toHaveTextContent("creates");
});

test("um artefato sem tarefa não mostra a seção Tarefas", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Rascunho" })] });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 1, name: "Rascunho" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Tarefas" })).not.toBeInTheDocument();
});

test("um artefato global mostra o catálogo global, o conteúdo do tipo e nenhuma ação de editar ou apagar", async () => {
  install({
    artifacts: [
      artifactFixture({
        id: "wk-1",
        name: "Corrida",
        type: "workout",
        global: true,
        data: { code: "running", category: "cardio", active: true },
      }),
    ],
  });
  renderArtifact("wk-1");

  expect(await screen.findByRole("heading", { level: 1, name: "Corrida" })).toBeInTheDocument();
  expect(screen.getByText("Catálogo global")).toBeInTheDocument();
  expect(screen.getByText("Cardio")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Tarefas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Editar|Excluir|Mais ações/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
});

test("uma nota de texto própria tem a barra de edição, que pede a edição desta nota", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias para a proposta", type: "text", data: { body: "Ideias" } })] });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 1, name: "Ideias para a proposta" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Pedir à IA para editar esta nota" }), { target: { value: "resuma em duas linhas" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(api.calls.find((call) => call.pathname === "/api/requests/edit")?.body).toEqual({
    userId: "user-1",
    text: "resuma em duas linhas",
    entityType: "artifact",
    entityId: "art-1",
  }));
});

test("um alimento com o cálculo pendente tem a barra desligada e diz por quê", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Arroz e feijão", type: "food", data: { ...FOOD, generation: { status: "pending" } } })] });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 1, name: "Arroz e feijão" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Pedir à IA para editar esta refeição" })).toBeDisabled();
  expect(screen.getByText("Aguarde a geração da refeição para editar a nota.")).toBeInTheDocument();
});

test("um alimento mostra os totais e a receita", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Arroz e feijão", type: "food", data: FOOD })] });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 1, name: "Arroz e feijão" })).toBeInTheDocument();
  expect(screen.getByText("Calorias consumidas")).toBeInTheDocument();
  expect(screen.getByText("412")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Receita" })).toBeInTheDocument();
  expect(screen.getByText("Cozinhar o arroz.")).toBeInTheDocument();
});

/** Leituras do artefato `id` que a tela fez até agora (a carga inicial e as recargas). */
function readsOf(id: string): number {
  return api.calls.filter((call) => call.method === "GET" && call.pathname === `/api/artifacts/${id}`).length;
}

/** Avança o relógio da tela: a recarga do alimento pendente roda a cada 1,5 s. */
async function passTime(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

test("um alimento com o cálculo pendente é relido a cada 1,5 s até o servidor terminar, e a recarga para", async () => {
  install({
    artifacts: [artifactFixture({ id: "art-1", name: "Arroz e feijão", type: "food", data: { ...FOOD, generation: { status: "pending" } } })],
  });
  renderArtifact("art-1");

  expect(await screen.findByText("Preparando informações nutricionais e receita…")).toBeInTheDocument();
  const carga = readsOf("art-1");

  // Passam 1,5 s com o cálculo ainda pendente: a tela lê o artefato de novo e continua pendente.
  await passTime(1500);
  expect(readsOf("art-1")).toBeGreaterThan(carga);
  expect(screen.getByText("Preparando informações nutricionais e receita…")).toBeInTheDocument();

  // O servidor termina o cálculo: a próxima leitura já traz os totais.
  const stored = api.store.table<StoredArtifact>("artifacts").get("art-1");
  if (stored) stored.data = FOOD;
  await passTime(1500);
  expect(screen.getByText("412")).toBeInTheDocument();
  expect(screen.queryByText("Preparando informações nutricionais e receita…")).not.toBeInTheDocument();

  // Concluído: nenhuma leitura nova, mesmo depois de muito tempo.
  const depois = readsOf("art-1");
  await passTime(6000);
  expect(readsOf("art-1")).toBe(depois);
});

test("um alimento com o cálculo falho diz que falhou, sem totais, e a recarga para", async () => {
  install({
    artifacts: [artifactFixture({ id: "art-1", name: "Arroz e feijão", type: "food", data: { ...FOOD, generation: { status: "pending" } } })],
  });
  renderArtifact("art-1");

  expect(await screen.findByText("Preparando informações nutricionais e receita…")).toBeInTheDocument();
  // O servidor desiste do cálculo: a próxima leitura traz a falha.
  const stored = api.store.table<StoredArtifact>("artifacts").get("art-1");
  if (stored) stored.data = { ...(stored.data as object), generation: { status: "failed" } };
  await passTime(1500);

  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar as informações da refeição.");
  expect(screen.queryByText("Calorias consumidas")).not.toBeInTheDocument();
  expect(screen.queryByText("Preparando informações nutricionais e receita…")).not.toBeInTheDocument();

  const depois = readsOf("art-1");
  await passTime(6000);
  expect(readsOf("art-1")).toBe(depois);
});

test("uma nota de sono usa o cartão da noite e o tempo que durou na agenda", async () => {
  install({
    tasks: [
      taskFixture({ id: "ev-1", name: "Sono", kind: "sleep", startedAt: "2026-10-03T23:30:00-03:00", estimatedFinishAt: "2026-10-04T07:00:00-03:00" }),
    ],
    artifacts: [
      artifactFixture({
        id: "art-1",
        name: "Sono",
        type: "sleep",
        data: { trackedSleepTime: 450, score: 80 },
        links: [{ taskId: "ev-1", relation: "creates" }],
      }),
    ],
  });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 2, name: "Sábado, 3 → domingo, 4 de outubro" })).toBeInTheDocument();
  expect(screen.getByText("Registrado pelo app de sono. Na agenda, a tarefa durou 7 h 30.")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Tempo registrado: 7 h 30" })).toBeInTheDocument();
});

test("um artefato inexistente mostra a tela de não encontrado", async () => {
  install({});
  renderArtifact("nao-existe");

  expect(await screen.findByRole("alert")).toHaveTextContent("Artefato não encontrado.");
});

test("avisa quando o artefato não carrega por outro motivo", async () => {
  net.authedFetch.mockRejectedValue(new Error("rede"));
  renderArtifact("art-1");

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o artefato.");
});

test("uma nota de texto própria tem Editar, que abre o formulário de edição", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias", data: { body: "Ideias" } })] });
  renderArtifact("art-1");

  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  expect(push).toHaveBeenCalledWith("/user-1/notas/art-1/editar");
});

test("Excluir pede confirmação, apaga a nota e volta para a lista", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias", data: { body: "Ideias" } })] });
  renderArtifact("art-1");

  fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/“Ideias” será excluída/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas"));
  expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", pathname: "/api/artifacts/art-1" });
});

test("Cancelar na confirmação mantém a nota e não apaga nada", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias", data: { body: "Ideias" } })] });
  renderArtifact("art-1");

  fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
  expect(replace).not.toHaveBeenCalled();
});

test.each([
  ["news", "Notícias"],
  ["email_summary", "Resumo de e-mail"],
  ["youtube_transcript", "Transcrição"],
] as const)("um artefato %s mostra o rótulo do tipo e o texto formatado, com os links, como a nota", async (type, label) => {
  install({
    artifacts: [
      artifactFixture({
        id: "art-livre",
        name: "Resumo do dia",
        type,
        data: { body: "Resumo do dia\nTrês assuntos pedem atenção.\n\n## Fontes\n- [A notícia completa](https://example.com/noticia)" },
        tags: ["leitura"],
      }),
    ],
  });
  renderArtifact("art-livre");

  expect(await screen.findByRole("heading", { level: 1, name: "Resumo do dia" })).toBeInTheDocument();
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByText("#leitura")).toBeInTheDocument();
  expect(screen.getByText("Três assuntos pedem atenção.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Fontes" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "A notícia completa" })).toHaveAttribute("href", "https://example.com/noticia");
});

test.each(["news", "email_summary", "youtube_transcript"] as const)("um artefato %s próprio tem Editar, Excluir e a barra de edição por IA, como a nota", async (type) => {
  install({ artifacts: [artifactFixture({ id: "art-livre", name: "Resumo do dia", type, data: { body: "Resumo" } })] });
  renderArtifact("art-livre");

  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  expect(push).toHaveBeenCalledWith("/user-1/notas/art-livre/editar");

  fireEvent.change(screen.getByRole("textbox", { name: "Pedir à IA para editar esta nota" }), { target: { value: "encurte" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => expect(api.calls.find((call) => call.pathname === "/api/requests/edit")?.body).toEqual({
    userId: "user-1",
    text: "encurte",
    entityType: "artifact",
    entityId: "art-livre",
  }));

  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/notas"));
  expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", pathname: "/api/artifacts/art-livre" });
});

test("puxar a tela relê o artefato sem voltar ao carregando", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias para a proposta", data: { body: "Começar pelo problema." } })] });
  render(<><PullToRefresh /><NoteDetailScreen userId="user-1" noteId="art-1" /></>);
  await screen.findByRole("heading", { level: 1, name: "Ideias para a proposta" });
  const before = readsOf("art-1");

  const stored = api.store.table<StoredArtifact>("artifacts").get("art-1");
  if (stored) stored.name = "Proposta revisada";
  pullDown();

  expect(screen.queryByText("Carregando artefato…")).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { level: 1, name: "Proposta revisada" })).toBeInTheDocument();
  expect(readsOf("art-1")).toBe(before + 1);
});

test("o artefato apagado em outro lugar vira não encontrado no puxão", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias para a proposta", data: { body: "Começar pelo problema." } })] });
  render(<><PullToRefresh /><NoteDetailScreen userId="user-1" noteId="art-1" /></>);
  await screen.findByRole("heading", { level: 1, name: "Ideias para a proposta" });

  api.store.table<StoredArtifact>("artifacts").delete("art-1");
  pullDown();

  expect(await screen.findByRole("alert")).toHaveTextContent("Artefato não encontrado.");
});

test("o puxão que falha mantém o artefato na tela e avisa; o seguinte que dá certo tira o aviso", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Ideias para a proposta", data: { body: "Começar pelo problema." } })] });
  render(<><PullToRefresh /><NoteDetailScreen userId="user-1" noteId="art-1" /></>);
  await screen.findByRole("heading", { level: 1, name: "Ideias para a proposta" });

  api.failNext("GET", "/api/artifacts/art-1", 500);
  pullDown();

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível atualizar o artefato. Tente novamente.");
  expect(screen.getByRole("heading", { level: 1, name: "Ideias para a proposta" })).toBeInTheDocument();
  expect(screen.getByText("Começar pelo problema.")).toBeInTheDocument();

  await waitFor(() => expect(document.querySelector("[data-phase]")).toHaveAttribute("data-phase", "idle"));
  pullDown();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});

test("a nota que a Leitura diária guarda de um vídeo sai em fichas, com a transcrição atrás de um botão", async () => {
  install({
    artifacts: [
      artifactFixture({
        id: "art-video",
        name: "Dormir bem para treinar melhor",
        type: "text",
        data: {
          body: [
            "Fonte: [YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ) · Corpo em Pauta",
            "",
            "## Resumo",
            "- [O sono pesa mais que o treino](#t-190) (03:10): o músculo se refaz dormindo.",
            "",
            "## Transcrição",
            "{#t-0} [00:00](https://youtu.be/dQw4w9WgXcQ?t=0) **Helena:** Hoje a conversa é sobre sono.",
            "",
            "{#t-190} [03:10](https://youtu.be/dQw4w9WgXcQ?t=190) **Paula:** O músculo se refaz dormindo.",
          ].join("\n"),
        },
      }),
    ],
  });
  renderArtifact("art-video");

  // O artefato continua sendo uma nota: só a leitura muda.
  expect(await screen.findByRole("heading", { level: 1, name: "Dormir bem para treinar melhor" })).toBeInTheDocument();
  expect(screen.getByText("Nota")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /O sono pesa mais que o treino/ })).toHaveAttribute("href", "#t-190");
  expect(screen.queryByText(/Hoje a conversa é sobre sono/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Ler a transcrição" }));

  expect(screen.getByText(/Hoje a conversa é sobre sono/)).toBeInTheDocument();
});

test("uma nota comum com títulos continua em markdown, sem fichas", async () => {
  install({
    artifacts: [artifactFixture({ id: "art-nota", name: "Compras", type: "text", data: { body: "## Mercado\n- pão\n- leite\n- café\n- arroz\n- feijão\n- sal" } })],
  });
  renderArtifact("art-nota");

  expect(await screen.findByRole("heading", { level: 2, name: "Mercado" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(6);
  expect(screen.queryByRole("button", { name: /Mostrar todas/ })).toBeNull();
});
