import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { EventEditRoute } = await import("./EventEditRoute");

const DETAIL_PATH = "/user-1/eventos/ev-1";
const REFUSED = "A API recusou alguma entrada. Confira os campos e tente de novo.";

/** O evento aberto: um treino de hoje, revisão 3 para conferir a revisão enviada. */
function parent(overrides: Partial<TaskDto> = {}): TaskDto {
  return eventFixture({
    id: "ev-1",
    name: "Treino de força",
    kind: "training",
    status: "doing",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    revision: 3,
    ...overrides,
  });
}

/** Outros eventos da busca: revisão 1 e status a fazer, que é o que a lista de tarefas devolve. */
function other(id: string, name: string, overrides: Partial<TaskDto> = {}): TaskDto {
  return eventFixture({ id, name, status: "todo", startedAt: "2026-11-14T20:00:00-03:00", revision: 1, ...overrides });
}

/** Um evento de agente: a sequência liga pessoa e agente nas duas pontas. */
const AGENT = eventFixture({
  id: "ag-1",
  actor: "agent",
  kind: "request",
  status: "done",
  name: "Monitorar a aplicação",
  startedAt: "2026-11-14T08:00:00-03:00",
});

const SEED = [parent(), other("ev-2", "Treino de peito", { kind: "training" }), other("ev-3", "Jantar leve", { kind: "meal" }), AGENT];

let api: FakeApi;

function install(events: TaskDto[] = SEED) {
  api = createFakeApi({ areas: [eventsArea], seed: { events } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderRoute() {
  return render(<EventEditRoute userId="user-1" eventId="ev-1" />);
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

/** O "+" de cada lista, pelo nome da busca do modal que ele abre. */
const ADD_BUTTONS: Record<string, string> = {
  "Buscar evento de que este se segue": "Adicionar evento de que este se segue",
  "Buscar evento da sequência": "Adicionar evento da sequência",
};

/** Abre o modal de seleção de uma das duas listas pelo "+" dela. */
function openPicker(label: string) {
  fireEvent.click(screen.getByRole("button", { name: ADD_BUTTONS[label] }));
}

/** A busca de uma das duas listas: abrir o modal pelo "+", digitar o texto e esperar a lista de resultados. */
function search(label: string, text: string) {
  openPicker(label);
  fireEvent.change(screen.getByRole("searchbox", { name: label }), { target: { value: text } });
}

const PREVIOUS_SEARCH = "Buscar evento de que este se segue";
const NEXT_SEARCH = "Buscar evento da sequência";

function previous() {
  return screen.getByRole("group", { name: "Segue-se de" });
}

function next() {
  return screen.getByRole("group", { name: "Da sequência a" });
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

describe("sequência na edição", () => {
  it("cada lado tem um + que abre o modal de seleção com a busca dele; fechar não escolhe nada", async () => {
    install();
    renderRoute();
    await loaded();

    // Sem abrir o modal, não há campo de busca na tela.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sequência" })).toBeInTheDocument();

    openPicker(PREVIOUS_SEARCH);
    expect(screen.getByRole("dialog", { name: "Segue-se de" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: PREVIOUS_SEARCH })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openPicker(NEXT_SEARCH);
    expect(screen.getByRole("dialog", { name: "Da sequência a" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: NEXT_SEARCH })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(patches()).toEqual([]);
  });

  it("o modal já abre com os eventos da lista de tarefas, sem digitar, e escolher um fecha o modal", async () => {
    install();
    renderRoute();
    await loaded();

    openPicker(PREVIOUS_SEARCH);
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Jantar leve”" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(previous()).getByText("Jantar leve")).toBeInTheDocument();
  });

  it("a busca consulta a lista de tarefas pelo texto e não mostra o evento aberto", async () => {
    install();
    renderRoute();
    await loaded();

    search(NEXT_SEARCH, "Treino");

    expect(await screen.findByRole("button", { name: "Escolher “Treino de peito”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Treino de força”" })).not.toBeInTheDocument();
  });

  it("a busca acha também evento de agente, sem filtrar por ator", async () => {
    install();
    renderRoute();
    await loaded();

    search(PREVIOUS_SEARCH, "Monitorar");

    expect(await screen.findByRole("button", { name: "Escolher “Monitorar a aplicação”" })).toBeInTheDocument();
    const lookup = api.calls.find((call) => call.pathname === "/api/events/tracked");
    expect(lookup?.query).not.toHaveProperty("actor");
  });

  it("escolher um antecessor e Salvar grava previousTaskIds no mesmo PATCH do título, sem revisar o antecessor", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Treino de costas" } });
    search(PREVIOUS_SEARCH, "Jantar");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Jantar leve”" }));
    expect(within(previous()).getByText("Jantar leve")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/events/ev-1",
        body: { expectedRevision: 3, name: "Treino de costas", previousTaskIds: ["ev-3"] },
      }),
    ]);
    // A API liga o outro lado, mas só o evento do PATCH sobe a revisão.
    const before = (await api.authedFetch("/api/events/ev-3")) as TaskDto;
    expect(before.revision).toBe(1);
    expect(before.nextTaskIds).toEqual(["ev-1"]);
  });

  it("escolher um evento em “Da sequência a” manda nextTaskIds, e o sucessor não é revisado", async () => {
    install();
    renderRoute();
    await loaded();

    search(NEXT_SEARCH, "Treino de peito");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Treino de peito”" }));
    expect(within(next()).getByText("Treino de peito")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/events/ev-1", body: { expectedRevision: 3, nextTaskIds: ["ev-2"] } }),
    ]);
    const successor = (await api.authedFetch("/api/events/ev-2")) as TaskDto;
    expect(successor.revision).toBe(1);
    expect(successor.previousTaskIds).toEqual(["ev-1"]);
  });

  it("um evento de agente pode ser a ponta de qualquer lado", async () => {
    install();
    renderRoute();
    await loaded();

    search(PREVIOUS_SEARCH, "Monitorar");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Monitorar a aplicação”" }));
    expect(within(previous()).getByText("Monitorar a aplicação")).toBeInTheDocument();
    expect(within(previous()).getByRole("img", { name: "Agente, feito" })).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/events/ev-1", body: { expectedRevision: 3, previousTaskIds: ["ag-1"] } }),
    ]);
  });

  it("os dois lados vão juntos no mesmo PATCH", async () => {
    install();
    renderRoute();
    await loaded();

    search(PREVIOUS_SEARCH, "Monitorar");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Monitorar a aplicação”" }));
    search(NEXT_SEARCH, "Jantar");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Jantar leve”" }));
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/events/ev-1",
        body: { expectedRevision: 3, previousTaskIds: ["ag-1"], nextTaskIds: ["ev-3"] },
      }),
    ]);
  });

  it("cada evento já ligado pode ser removido, e a remoção vai no Salvar", async () => {
    install([
      parent({ previousTaskIds: ["ev-3"] }),
      other("ev-3", "Jantar leve", { kind: "meal", nextTaskIds: ["ev-1"] }),
    ]);
    renderRoute();
    await loaded();

    expect(await within(previous()).findByText("Jantar leve")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deixar de se seguir de “Jantar leve”" }));
    expect(within(previous()).getByText("nenhum evento")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/events/ev-1", body: { expectedRevision: 3, previousTaskIds: [] } }),
    ]);
    const other3 = (await api.authedFetch("/api/events/ev-3")) as TaskDto;
    expect(other3.nextTaskIds).toEqual([]);
    expect(other3.revision).toBe(1);
  });

  it("remover um evento de “Da sequência a” manda nextTaskIds sem ele", async () => {
    install([
      parent({ nextTaskIds: ["ev-2", "ev-3"] }),
      other("ev-2", "Treino de peito", { previousTaskIds: ["ev-1"] }),
      other("ev-3", "Jantar leve", { previousTaskIds: ["ev-1"] }),
    ]);
    renderRoute();
    await loaded();

    expect(await within(next()).findByText("Treino de peito")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover “Treino de peito” da sequência" }));
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/events/ev-1", body: { expectedRevision: 3, nextTaskIds: ["ev-3"] } }),
    ]);
  });

  it("uma recusa da API mostra a mensagem, mantém o formulário e o evento escolhido", async () => {
    install();
    api.failNext("PATCH", "/api/events/ev-1", 400);
    renderRoute();
    await loaded();

    search(NEXT_SEARCH, "Treino de peito");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Treino de peito”" }));
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(REFUSED);
    expect(within(next()).getByText("Treino de peito")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
