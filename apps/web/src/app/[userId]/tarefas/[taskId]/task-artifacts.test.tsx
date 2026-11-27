import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: TaskPage } = await import("./page");

let api: FakeApi;

function install(tasks: TaskDto[], artifacts: ReturnType<typeof artifactFixture>[]) {
  api = createFakeApi({ areas: [tasksArea, artifactsArea], seed: { tasks: tasks, artifacts } });
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
  return render(<TaskPage params={Promise.resolve({ userId: "user-1", taskId: "ev-1" })} />);
}

async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

const TREINO = taskFixture({ id: "ev-1", name: "Treino de força", kind: "training", status: "doing", startedAt: "2026-11-14T18:30:00-03:00" });

test("a seção Artefatos mostra a contagem e, em cada cartão, a posição, o tipo e a relação; “catálogo global” só no do catálogo", async () => {
  install(
    [TREINO],
    [
      // A ordem da seção é a ordem em que os artefatos foram semeados, como na tarefa da API.
      artifactFixture({
        id: "art-global",
        name: "Musculação",
        type: "workout",
        global: true,
        data: { code: "weightlifting", category: "strength", active: true },
        links: [{ taskId: "ev-1", relation: "uses" }],
      }),
      artifactFixture({ id: "art-own", name: "Ficha A · peito e tríceps", links: [{ taskId: "ev-1", relation: "uses" }] }),
      artifactFixture({ id: "art-created", name: "Registro do treino de hoje", type: "training", data: { workouts: [], caloriesBurned: 0 }, links: [{ taskId: "ev-1", relation: "creates" }] }),
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
  expect(within(own).queryByText("seu artefato")).not.toBeInTheDocument();
  expect(within(own.closest("li") as HTMLElement).getByText("2")).toBeInTheDocument();

  const created = within(section).getByRole("link", { name: /Registro do treino/ });
  const createdRow = created.closest("li") as HTMLElement;
  expect(within(createdRow).getByText("training")).toBeInTheDocument();
  expect(within(createdRow).getByText("creates")).toBeInTheDocument();
  expect(within(createdRow).queryByText("3")).not.toBeInTheDocument();
  expect(within(createdRow).queryByText("sem posição na lista")).not.toBeInTheDocument();
});

test("tocar num artefato abre o detalhe dele", async () => {
  install([TREINO], [artifactFixture({ id: "art-own", name: "Ficha A", links: [{ taskId: "ev-1", relation: "uses" }] })]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).getByRole("link", { name: /Ficha A/ })).toHaveAttribute("href", "/user-1/notas/art-own");
});

test("o conteúdo do artefato aparece inteiro dentro da tarefa, embaixo da linha dele", async () => {
  install(
    [taskFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [
      artifactFixture({ id: "art-nota", name: "Observação", data: { body: "Comer devagar e beber água." }, links: [{ taskId: "ev-1", relation: "uses" }] }),
      foodFixture("food-arroz", "Arroz com feijão", 420, { links: [{ taskId: "ev-1", relation: "uses" }] }),
    ],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  const note = within(section).getByRole("link", { name: /Observação/ }).closest("li") as HTMLElement;
  expect(within(note).getByText("Comer devagar e beber água.")).toBeInTheDocument();

  const food = within(section).getByRole("link", { name: /Arroz com feijão/ }).closest("li") as HTMLElement;
  expect(within(food).getByRole("region", { name: "Informações nutricionais" })).toBeInTheDocument();
});

test("a seta recolhe e estende o conteúdo do artefato", async () => {
  install([TREINO], [artifactFixture({ id: "art-nota", name: "Observação", data: { body: "Aquecer antes." }, links: [{ taskId: "ev-1", relation: "uses" }] })]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  const collapse = within(section).getByRole("button", { name: "Recolher o conteúdo de Observação" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(within(section).getByText("Aquecer antes.")).toBeVisible();

  fireEvent.click(collapse);
  const expand = within(section).getByRole("button", { name: "Estender o conteúdo de Observação" });
  expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(within(section).queryByText("Aquecer antes.")).not.toBeVisible();

  fireEvent.click(expand);
  expect(within(section).getByText("Aquecer antes.")).toBeVisible();
});

test("skill fica só na linha: o arquivo do Hermes abre no detalhe do artefato", async () => {
  install(
    [TREINO],
    [
      artifactFixture({
        id: "art-skill",
        name: "Planejar treino",
        type: "skill",
        data: { path: "hermes/skills/treino/SKILL.md", hash: "abc", missing: false, description: "Monta a ficha da semana" },
        links: [{ taskId: "ev-1", relation: "uses" }],
      }),
    ],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  const row = within(section).getByRole("link", { name: /Planejar treino/ }).closest("li") as HTMLElement;
  expect(within(row).queryByText("Monta a ficha da semana")).not.toBeInTheDocument();
  expect(within(row).queryByText("hermes/skills/treino/SKILL.md")).not.toBeInTheDocument();
  expect(within(row).queryByRole("button", { name: /conteúdo de Planejar treino/ })).not.toBeInTheDocument();
});

test("tarefa sem artefatos mostra a seção só com a ação de adicionar", async () => {
  install([TREINO], [artifactFixture({ id: "art-other", name: "De outra tarefa", links: [{ taskId: "ev-2", relation: "uses" }] })]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).queryByRole("list")).not.toBeInTheDocument();
  expect(within(section).getByRole("button", { name: "Adicionar exercício ao treino" })).toBeInTheDocument();
});

const COMUM = taskFixture({ id: "ev-1", name: "Preparar a viagem", kind: "common", status: "doing", startedAt: "2026-11-14T09:00:00-03:00" });

test("“Adicionar artefato” liga um artefato seu no fim da lista, com a relação uses, e grava na hora", async () => {
  install(
    [COMUM],
    [
      artifactFixture({ id: "art-linked", name: "Roteiro", links: [{ taskId: "ev-1", relation: "uses" }] }),
      artifactFixture({ id: "art-free", name: "Lista de malas" }),
    ],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  fireEvent.click(within(section).getByRole("button", { name: "Adicionar artefato" }));
  expect(await screen.findByRole("button", { name: "Escolher “Lista de malas”" })).toBeInTheDocument();
  // O que já está ligado não é oferecido de novo.
  expect(screen.queryByRole("button", { name: "Escolher “Roteiro”" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Escolher “Lista de malas”" }));

  expect(await within(section).findByRole("link", { name: /Lista de malas/ })).toHaveAttribute("href", "/user-1/notas/art-free");
  const patch = api.calls.find((call) => call.method === "PATCH");
  expect(patch?.body).toMatchObject({
    artifacts: [
      { id: "art-linked", relation: "uses" },
      { id: "art-free", relation: "uses" },
    ],
  });
  expect(push).not.toHaveBeenCalled();
});

test("na refeição, o alimento escolhido no detalhe entra como cópia nova", async () => {
  install(
    [taskFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [foodFixture("food-arroz", "Arroz", 200, { global: true })],
  );
  renderPage();
  await loaded();

  fireEvent.click(within(await screen.findByRole("region", { name: "Artefatos" })).getByRole("button", { name: "Adicionar alimento à refeição" }));
  fireEvent.click(await screen.findByRole("button", { name: "Escolher “Arroz”" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ artifacts: [{ copyOf: "food-arroz" }] });
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

test("no cartão do alimento, as calorias, os macros, os alimentos que recolhem e o aviso da IA", async () => {
  install(
    [taskFixture({ id: "ev-1", name: "Refeição", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [
      foodFixture("food-hotdog", "Refeição", 270, {
        links: [{ taskId: "ev-1", relation: "creates" }],
        data: {
          description: "Cachorro-quente",
          items: [
            { id: "i-1", name: "Pão de hot dog", portion: "1 unidade", approximateWeightGrams: 50, caloriesKcal: 140, macronutrients: { carbohydratesGrams: 26, proteinsGrams: 4, totalFatGrams: 2, fiberGrams: 1 } },
            { id: "i-2", name: "Salsicha cozida", portion: "1 unidade", approximateWeightGrams: 50, caloriesKcal: 130, macronutrients: { carbohydratesGrams: 1, proteinsGrams: 6, totalFatGrams: 11, fiberGrams: 0 } },
          ],
          totals: { totalCaloriesKcal: 270, totalProteinGrams: 10, totalCarbohydrateGrams: 27, totalFatGrams: 13, totalFiberGrams: 1 },
          generation: { status: "completed" },
          nutritionSource: "model-estimate",
        },
      }),
    ],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  const card = within(section).getByRole("link", { name: /Refeição/ }).closest("li") as HTMLElement;
  const summary = within(card).getByRole("region", { name: "Informações nutricionais" });
  expect(within(summary).getByRole("img", { name: "270 quilocalorias consumidas" })).toBeInTheDocument();
  expect(within(summary).getByText("Proteínas")).toBeInTheDocument();
  expect(within(summary).getByText("10 g")).toBeInTheDocument();
  expect(within(card).getByText("Estimativa nutricional da IA")).toBeInTheDocument();

  const foods = within(card).getByRole("button", { name: /Alimentos/ });
  expect(foods).toHaveAttribute("aria-expanded", "true");
  expect(within(card).getByText("Pão de hot dog")).toBeVisible();
  expect(within(card).getByText("140 kcal")).toBeVisible();

  fireEvent.click(foods);
  expect(foods).toHaveAttribute("aria-expanded", "false");
  expect(within(card).queryByText("Pão de hot dog")).not.toBeVisible();
});

test("refeição mostra o total de calorias: a soma dos alimentos ligados, cópias incluídas", async () => {
  install(
    [taskFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [
      foodFixture("food-arroz", "Arroz", 200, { links: [{ taskId: "ev-1", relation: "uses" }] }),
      foodFixture("copy-frango", "Frango", 350.4, { derived: true, links: [{ taskId: "ev-1", relation: "uses" }] }),
      artifactFixture({ id: "art-nota", name: "Observação", links: [{ taskId: "ev-1", relation: "uses" }] }),
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
    [taskFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" })],
    [artifactFixture({ id: "art-nota", name: "Observação", links: [{ taskId: "ev-1", relation: "uses" }] })],
  );
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).getByText("0 kcal")).toBeInTheDocument();
});

test("treino não mostra total de calorias", async () => {
  install([TREINO], [foodFixture("food-arroz", "Arroz", 200, { links: [{ taskId: "ev-1", relation: "uses" }] })]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Artefatos" });
  expect(within(section).queryByText("Total de calorias")).not.toBeInTheDocument();
});
