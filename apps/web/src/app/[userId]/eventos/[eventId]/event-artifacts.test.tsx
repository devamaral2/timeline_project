import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: EventPage } = await import("./page");

let api: FakeApi;

function install(events: EventDto[], artifacts: ReturnType<typeof artifactFixture>[]) {
  api = createFakeApi({ areas: [eventsArea, artifactsArea], seed: { events, artifacts } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(<EventPage params={Promise.resolve({ userId: "user-1", eventId: "ev-1" })} />);
}

async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

const TREINO = eventFixture({ id: "ev-1", name: "Treino de força", kind: "training", status: "doing", startedAt: "2026-11-14T18:30:00-03:00" });

test("a seção Artefatos mostra a contagem, a posição, o tipo, de quem é e a relação de cada um", async () => {
  install(
    [TREINO],
    [
      // A ordem da seção é a ordem em que os artefatos foram semeados, como no evento da API.
      artifactFixture({
        id: "art-global",
        name: "Musculação",
        type: "workout",
        global: true,
        data: { code: "weightlifting", category: "strength", active: true },
        links: [{ eventId: "ev-1", relation: "uses" }],
      }),
      artifactFixture({ id: "art-own", name: "Ficha A · peito e tríceps", links: [{ eventId: "ev-1", relation: "uses" }] }),
      artifactFixture({ id: "art-created", name: "Registro do treino de hoje", type: "training", data: { workouts: [], caloriesBurned: 0 }, links: [{ eventId: "ev-1", relation: "creates" }] }),
    ],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).getByText("3")).toBeInTheDocument();

  const global = within(section).getByRole("link", { name: /Musculação/ });
  expect(within(global).getByText("workout")).toBeInTheDocument();
  expect(within(global).getByText("catálogo global")).toBeInTheDocument();
  expect(within(global.closest("li") as HTMLElement).getByText("uses")).toBeInTheDocument();
  expect(within(global.closest("li") as HTMLElement).getByText("1")).toBeInTheDocument();

  const own = within(section).getByRole("link", { name: /Ficha A/ });
  expect(within(own).getByText("seu artefato")).toBeInTheDocument();
  expect(within(own.closest("li") as HTMLElement).getByText("2")).toBeInTheDocument();

  const created = within(section).getByRole("link", { name: /Registro do treino/ });
  const createdRow = created.closest("li") as HTMLElement;
  expect(within(createdRow).getByText("—")).toBeInTheDocument();
  expect(within(createdRow).getByText("sem posição na lista")).toBeInTheDocument();
  expect(within(createdRow).getByText("creates")).toBeInTheDocument();
});

test("tocar num artefato abre o detalhe dele", async () => {
  install([TREINO], [artifactFixture({ id: "art-own", name: "Ficha A", links: [{ eventId: "ev-1", relation: "uses" }] })]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).getByRole("link", { name: /Ficha A/ })).toHaveAttribute("href", "/user-1/notas/art-own");
});

test("evento sem artefatos não mostra a seção", async () => {
  install([TREINO], [artifactFixture({ id: "art-other", name: "De outro evento", links: [{ eventId: "ev-2", relation: "uses" }] })]);
  renderPage();
  await loaded();

  await screen.findByRole("region", { name: "Informações" });
  expect(screen.queryByRole("region", { name: "Artefatos" })).not.toBeInTheDocument();
});

/** Um alimento com o total de calorias dado; o resto do conteúdo é o mínimo que o contrato aceita. */
function foodFixture(id: string, name: string, kcal: number, overrides: Partial<ReturnType<typeof artifactFixture>> = {}) {
  return artifactFixture({
    id,
    name,
    type: "food",
    data: {
      description: name,
      items: [],
      totals: { totalCaloriesKcal: kcal, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
      generation: { status: "completed" },
    },
    ...overrides,
  });
}

test("refeição mostra o total de calorias: a soma dos alimentos ligados, cópias incluídas", async () => {
  install(
    [eventFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [
      foodFixture("food-arroz", "Arroz", 200, { links: [{ eventId: "ev-1", relation: "uses" }] }),
      foodFixture("copy-frango", "Frango", 350.4, { derived: true, links: [{ eventId: "ev-1", relation: "uses" }] }),
      artifactFixture({ id: "art-nota", name: "Observação", links: [{ eventId: "ev-1", relation: "uses" }] }),
    ],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).getByText("Total de calorias")).toBeInTheDocument();
  expect(within(section).getByText("550 kcal")).toBeInTheDocument();
});

test("refeição sem alimento ligado mostra zero kcal", async () => {
  install(
    [eventFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [artifactFixture({ id: "art-nota", name: "Observação", links: [{ eventId: "ev-1", relation: "uses" }] })],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).getByText("0 kcal")).toBeInTheDocument();
});

test("treino não mostra total de calorias", async () => {
  install([TREINO], [foodFixture("food-arroz", "Arroz", 200, { links: [{ eventId: "ev-1", relation: "uses" }] })]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).queryByText("Total de calorias")).not.toBeInTheDocument();
});
