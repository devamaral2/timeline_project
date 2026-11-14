import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

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
  api = createFakeApi({ areas: [artifactsArea, eventsArea], seed });
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
  expect(screen.getByText("#trabalho")).toBeInTheDocument();
  expect(screen.getByText("Começar pelo problema do cliente.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Pontos para a reunião" })).toBeInTheDocument();
  const registro = screen.getByRole("region", { name: "Registro" });
  expect(within(registro).getByText("12 set., 09:00")).toBeInTheDocument();
  expect(within(registro).getByText("ontem, 21:12")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Notas" })).toHaveAttribute("href", "/user-1/notas");
  expect(api.calls.at(-1)).toMatchObject({ method: "GET", pathname: "/api/artifacts/art-1" });
});

test("lista os eventos em que o artefato aparece, com a relação, e cada um abre o detalhe do evento", async () => {
  install({
    events: [
      eventFixture({ id: "ev-9", name: "Academia", kind: "training", startedAt: "2026-09-14T07:00:00-03:00", estimatedFinishAt: "2026-09-14T08:00:00-03:00" }),
      eventFixture({ id: "ev-1", name: "Almoço", kind: "meal", startedAt: "2026-09-13T12:00:00-03:00" }),
    ],
    artifacts: [
      artifactFixture({
        id: "art-1",
        name: "Arroz e feijão",
        type: "food",
        data: FOOD,
        links: [{ eventId: "ev-9", relation: "uses" }, { eventId: "ev-1", relation: "creates" }],
      }),
    ],
  });
  renderArtifact("art-1");

  const eventos = await screen.findByRole("region", { name: "Eventos" });
  const academia = within(eventos).getByRole("link", { name: /Academia/ });
  expect(academia).toHaveAttribute("href", "/user-1/eventos/ev-9");
  expect(academia).toHaveTextContent("uses");
  expect(within(eventos).getByRole("link", { name: /Almoço/ })).toHaveAttribute("href", "/user-1/eventos/ev-1");
  expect(within(eventos).getByRole("link", { name: /Almoço/ })).toHaveTextContent("creates");
});

test("um artefato sem evento diz que não aparece em nenhum", async () => {
  install({ artifacts: [artifactFixture({ id: "art-1", name: "Rascunho" })] });
  renderArtifact("art-1");

  expect(await screen.findByText("Não aparece em nenhum evento.")).toBeInTheDocument();
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
  expect(screen.queryByRole("region", { name: "Eventos" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Editar|Excluir|Mais ações/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
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

test("um alimento com o cálculo pendente é relido até o servidor terminar", async () => {
  install({
    artifacts: [artifactFixture({ id: "art-1", name: "Arroz e feijão", type: "food", data: { ...FOOD, generation: { status: "pending" } } })],
  });
  renderArtifact("art-1");

  expect(await screen.findByText("Preparando informações nutricionais e receita…")).toBeInTheDocument();
  // O servidor termina o cálculo: a próxima leitura já traz os totais.
  const stored = api.store.table<StoredArtifact>("artifacts").get("art-1");
  if (stored) stored.data = FOOD;
  expect(await screen.findByText("412", {}, { timeout: 4000 })).toBeInTheDocument();
});

test("uma nota de sono usa o cartão da noite e o tempo que durou na agenda", async () => {
  install({
    events: [
      eventFixture({ id: "ev-1", name: "Sono", kind: "sleep", startedAt: "2026-10-03T23:30:00-03:00", estimatedFinishAt: "2026-10-04T07:00:00-03:00" }),
    ],
    artifacts: [
      artifactFixture({
        id: "art-1",
        name: "Sono",
        type: "sleep",
        data: { trackedSleepTime: 450, score: 80 },
        links: [{ eventId: "ev-1", relation: "creates" }],
      }),
    ],
  });
  renderArtifact("art-1");

  expect(await screen.findByRole("heading", { level: 2, name: "Sábado, 3 → domingo, 4 de outubro" })).toBeInTheDocument();
  expect(screen.getByText("Registrado pelo app de sono. Na agenda, o evento durou 7 h 30.")).toBeInTheDocument();
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
