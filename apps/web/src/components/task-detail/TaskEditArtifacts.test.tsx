import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskEditRoute } = await import("./TaskEditRoute");

const DETAIL_PATH = "/user-1/eventos/ev-1";

/**
 * O evento aberto, com revisão 3, e três artefatos ligados: duas fichas (uses) e o que ele criou. É rotina, que
 * busca os artefatos próprios; refeição e treino têm buscas próprias, testadas mais abaixo.
 */
const TASK = eventFixture({
  id: "ev-1",
  name: "Treino de força",
  kind: "common",
  status: "doing",
  startedAt: "2026-11-14T18:30:00-03:00",
  estimatedFinishAt: "2026-11-14T19:20:00-03:00",
  revision: 3,
});

/** Os artefatos do usuário. "Caminhada" não está ligada e é a que a busca acha. */
const ARTIFACTS: StoredArtifact[] = [
  artifactFixture({ id: "art-sheet", name: "Ficha A", links: [{ eventId: "ev-1", relation: "uses" }] }),
  artifactFixture({ id: "art-sheet-b", name: "Ficha B", links: [{ eventId: "ev-1", relation: "uses" }] }),
  artifactFixture({ id: "art-created", name: "Registro do treino", links: [{ eventId: "ev-1", relation: "creates" }] }),
  artifactFixture({ id: "art-walk", name: "Caminhada no parque" }),
];

let api: FakeApi;

function install(task: TaskDto = TASK, artifacts: StoredArtifact[] = ARTIFACTS) {
  api = createFakeApi({ areas: [eventsArea, artifactsArea], seed: { events: [task], artifacts } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderRoute() {
  return render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
}

function patches() {
  return api.calls.filter((call) => call.method === "PATCH");
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

async function loaded() {
  await screen.findByRole("heading", { level: 1, name: "Editar evento" });
}

/** O "+" da lista, pelo nome da busca do modal que ele abre (depende do tipo do evento). */
const ADD_BUTTONS: Record<string, string> = {
  "Buscar artefato para ligar": "Adicionar artefato",
  "Buscar alimento para a refeição": "Adicionar alimento à refeição",
  "Buscar exercício para o treino": "Adicionar exercício ao treino",
};

/** A busca do modal de seleção: abre pelo "+" (escolher um item fecha o modal) e digita o texto. */
function search(label: string, text: string) {
  if (!screen.queryByRole("dialog")) fireEvent.click(screen.getByRole("button", { name: ADD_BUTTONS[label] }));
  fireEvent.change(screen.getByRole("searchbox", { name: label }), { target: { value: text } });
}

function linked() {
  return screen.getByRole("list", { name: "Artefatos ligados" });
}

/** A ordem dos nomes na lista de artefatos ligados, lida pelo botão Remover de cada linha. */
function linkedNames(): string[] {
  return within(linked())
    .getAllByRole("button", { name: /^Remover artefato/ })
    .map((button) => (button.getAttribute("aria-label") ?? "").replace(/^Remover artefato “/, "").replace(/”$/, ""));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
  replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("artefatos na edição", () => {
  it("a lista mostra os artefatos do evento na ordem da API, com o que ele criou sem posição", async () => {
    install();
    renderRoute();
    await loaded();

    expect(within(linked()).getByText("Ficha A")).toBeInTheDocument();
    expect(within(linked()).getByText("Ficha B")).toBeInTheDocument();
    expect(within(linked()).getByText("sem posição na lista")).toBeInTheDocument();
  });

  it("buscar um artefato seu o põe no fim com a relação uses, e Salvar manda a lista inteira na ordem da tela", async () => {
    install();
    renderRoute();
    await loaded();

    search("Buscar artefato para ligar", "Caminhada");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Caminhada no parque”" }));
    expect(linkedNames()).toEqual(["Ficha A", "Ficha B", "Registro do treino", "Caminhada no parque"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/tasks/ev-1",
        body: {
          expectedRevision: 3,
          artifacts: [
            { id: "art-sheet", relation: "uses" },
            { id: "art-sheet-b", relation: "uses" },
            { id: "art-created", relation: "creates" },
            { id: "art-walk", relation: "uses" },
          ],
        },
      }),
    ]);
  });

  it("a busca não oferece o que já está na lista", async () => {
    install();
    renderRoute();
    await loaded();

    search("Buscar artefato para ligar", "Ficha");
    await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/artifacts" && call.query.q === "Ficha")).toBe(true));
    expect(screen.queryByRole("button", { name: "Escolher “Ficha A”" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Ficha B”" })).not.toBeInTheDocument();
  });

  it("subir e descer reordenam, e a ordem enviada é a da tela; o que o evento criou não se move", async () => {
    install();
    renderRoute();
    await loaded();

    expect(screen.getByRole("button", { name: "Subir “Ficha A”" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descer “Ficha A”" }));
    expect(linkedNames()).toEqual(["Ficha B", "Ficha A", "Registro do treino"]);
    expect(screen.queryByRole("button", { name: "Subir “Registro do treino”" })).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: {
          expectedRevision: 3,
          artifacts: [
            { id: "art-sheet-b", relation: "uses" },
            { id: "art-sheet", relation: "uses" },
            { id: "art-created", relation: "creates" },
          ],
        },
      }),
    ]);
    const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
    expect(task.artifacts.map((link) => link.artifact.name)).toEqual(["Ficha B", "Ficha A", "Registro do treino"]);
  });

  it("remover tira a ligação na hora, a remoção vai no Salvar, e o artefato continua existindo", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Remover artefato “Ficha B”" }));
    expect(linkedNames()).toEqual(["Ficha A", "Registro do treino"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: { expectedRevision: 3, artifacts: [{ id: "art-sheet", relation: "uses" }, { id: "art-created", relation: "creates" }] },
      }),
    ]);
    const removed = (await api.authedFetch("/api/artifacts/art-sheet-b")) as { name: string };
    expect(removed.name).toBe("Ficha B");
  });

  it("ligar, reordenar e remover antes de um Salvar só: o corpo leva a lista que está na tela", async () => {
    install();
    renderRoute();
    await loaded();

    search("Buscar artefato para ligar", "Caminhada");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Caminhada no parque”" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir “Caminhada no parque”" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover artefato “Ficha A”" }));
    // Subir a caminhada troca com a Ficha B, que é a posição de cima; o que o evento criou fica no meio, sem número.
    expect(linkedNames()).toEqual(["Caminhada no parque", "Registro do treino", "Ficha B"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: {
          expectedRevision: 3,
          artifacts: [
            { id: "art-walk", relation: "uses" },
            { id: "art-created", relation: "creates" },
            { id: "art-sheet-b", relation: "uses" },
          ],
        },
      }),
    ]);
  });

  it("sem mexer na lista, o Salvar não manda artifacts", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Treino de costas" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([expect.objectContaining({ body: { expectedRevision: 3, name: "Treino de costas" } })]);
  });
});

const FOOD = {
  description: "Arroz",
  items: [],
  totals: { totalCaloriesKcal: 200, totalProteinGrams: 4, totalCarbohydrateGrams: 44, totalFatGrams: 0, totalFiberGrams: 1 },
  generation: { status: "completed" },
};

const MEAL = eventFixture({ id: "ev-1", name: "Almoço", kind: "meal", status: "doing", revision: 3, startedAt: "2026-11-14T12:00:00-03:00" });
const TRAINING = eventFixture({ id: "ev-1", name: "Treino de força", kind: "training", status: "doing", revision: 3, startedAt: "2026-11-14T18:30:00-03:00" });

describe("refeição: alimento do catálogo global ou dos seus, como cópia com quantidade", () => {
  const FOODS: StoredArtifact[] = [
    artifactFixture({ id: "food-global", name: "Arroz cozido", type: "food", global: true, data: FOOD }),
    artifactFixture({ id: "food-own", name: "Arroz integral da casa", type: "food", data: FOOD }),
    artifactFixture({ id: "art-own-text", name: "Arroz de uma nota", links: [] }),
  ];

  it("a busca oferece os alimentos do catálogo global e os seus, e não as notas", async () => {
    install(MEAL, FOODS);
    renderRoute();
    await loaded();

    search("Buscar alimento para a refeição", "Arroz");
    expect(await screen.findByRole("button", { name: "Escolher “Arroz cozido”" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher “Arroz integral da casa”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Arroz de uma nota”" })).not.toBeInTheDocument();
    // O modal abre já com os primeiros alimentos; a consulta com o texto sai depois da pausa de digitação.
    const queries = () => api.calls.filter((call) => call.pathname === "/api/artifacts").map((call) => call.query);
    await waitFor(() =>
      expect(queries()).toEqual(expect.arrayContaining([expect.objectContaining({ type: "food", scope: "global", q: "Arroz" }), expect.objectContaining({ type: "food", q: "Arroz" })])),
    );
  });

  it("o alimento escolhido entra com a quantidade informada e Salvar manda copyOf e quantity", async () => {
    install(MEAL, FOODS);
    renderRoute();
    await loaded();

    search("Buscar alimento para a refeição", "Arroz cozido");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Arroz cozido”" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Quantidade de “Arroz cozido”" }), { target: { value: " 150 g " } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([expect.objectContaining({ body: { expectedRevision: 3, artifacts: [{ copyOf: "food-global", quantity: "150 g" }] } })]);
    const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
    expect(task.artifacts).toEqual([
      expect.objectContaining({ relation: "uses", artifact: expect.objectContaining({ name: "Arroz cozido", derived: true, data: expect.objectContaining({ quantity: "150 g" }) }) }),
    ]);
  });

  it("sem quantidade, a cópia vai só com copyOf; o mesmo alimento pode entrar duas vezes, cada uma com a sua", async () => {
    install(MEAL, FOODS);
    renderRoute();
    await loaded();

    search("Buscar alimento para a refeição", "Arroz integral");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Arroz integral da casa”" }));
    search("Buscar alimento para a refeição", "Arroz integral");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Arroz integral da casa”" }));
    fireEvent.change(screen.getAllByRole("textbox", { name: "Quantidade de “Arroz integral da casa”" })[1] as HTMLElement, { target: { value: "2" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([expect.objectContaining({ body: { expectedRevision: 3, artifacts: [{ copyOf: "food-own" }, { copyOf: "food-own", quantity: "2" }] } })]);
  });

  it("editar o alimento original depois não muda a refeição que já tem a cópia", async () => {
    install(MEAL, FOODS);
    renderRoute();
    await loaded();

    search("Buscar alimento para a refeição", "Arroz integral");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Arroz integral da casa”" }));
    save();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));

    await api.authedFetch("/api/artifacts/food-own", {
      method: "PATCH",
      body: JSON.stringify({ expectedRevision: 1, type: "food", data: { ...FOOD, totals: { ...FOOD.totals, totalCaloriesKcal: 999 } } }),
    });
    const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
    expect(task.artifacts[0]?.artifact.data).toMatchObject({ totals: { totalCaloriesKcal: 200 } });
  });
});

describe("treino: exercício do catálogo global, por referência, na ordem da lista", () => {
  const EXERCISES: StoredArtifact[] = [
    artifactFixture({ id: "ex-supino", name: "Supino reto", type: "workout", global: true, data: { code: "weightlifting", category: "strength", active: true } }),
    artifactFixture({ id: "ex-remada", name: "Remada curvada", type: "workout", global: true, data: { code: "weightlifting", category: "strength", active: true } }),
    artifactFixture({ id: "art-ficha", name: "Ficha de costas", links: [] }),
  ];

  it("a busca oferece os exercícios do catálogo global, e não os artefatos próprios", async () => {
    install(TRAINING, EXERCISES);
    renderRoute();
    await loaded();

    search("Buscar exercício para o treino", "reto");
    expect(await screen.findByRole("button", { name: "Escolher “Supino reto”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Ficha de costas”" })).not.toBeInTheDocument();
    // O modal abre já com os primeiros exercícios; a consulta com o texto sai depois da pausa de digitação.
    const queries = () => api.calls.filter((call) => call.pathname === "/api/artifacts").map((call) => call.query);
    await waitFor(() => expect(queries()).toContainEqual(expect.objectContaining({ type: "workout", scope: "global", q: "reto" })));
    expect(screen.queryByRole("button", { name: "Escolher “Ficha de costas”" })).not.toBeInTheDocument();
  });

  it("o exercício entra por referência, no fim da lista, e Salvar manda id e relação na ordem", async () => {
    install(TRAINING, EXERCISES);
    renderRoute();
    await loaded();

    search("Buscar exercício para o treino", "Supino");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Supino reto”" }));
    search("Buscar exercício para o treino", "Remada");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Remada curvada”" }));
    expect(linkedNames()).toEqual(["Supino reto", "Remada curvada"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: { expectedRevision: 3, artifacts: [{ id: "ex-supino", relation: "uses" }, { id: "ex-remada", relation: "uses" }] },
      }),
    ]);
  });

  it("um exercício que já está na lista não é oferecido de novo", async () => {
    install(TRAINING, EXERCISES.map((item) => (item.id === "ex-supino" ? { ...item, links: [{ eventId: "ev-1", relation: "uses" as const }] } : item)));
    renderRoute();
    await loaded();

    search("Buscar exercício para o treino", "Supino");
    await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/artifacts" && call.query.q === "Supino")).toBe(true));
    expect(screen.queryByRole("button", { name: "Escolher “Supino reto”" })).not.toBeInTheDocument();
  });
});
