import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDto } from "@repo/contracts";
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
function parent(overrides: Partial<EventDto> = {}): EventDto {
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
function other(id: string, name: string, overrides: Partial<EventDto> = {}): EventDto {
  return eventFixture({ id, name, status: "todo", startedAt: "2026-11-14T20:00:00-03:00", revision: 1, ...overrides });
}

const SEED = [parent(), other("ev-2", "Treino de peito", { kind: "training" }), other("ev-3", "Jantar leve", { kind: "meal" })];

let api: FakeApi;

function install(events: EventDto[] = SEED) {
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

/** A busca de uma das duas listas: digitar o texto e esperar a lista de resultados. */
function search(label: string, text: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: label }), { target: { value: text } });
}

function blockedBy() {
  return screen.getByRole("group", { name: "Bloqueado por" });
}

function blocks() {
  return screen.getByRole("group", { name: "Bloqueia" });
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

describe("bloqueios na edição", () => {
  it("há uma busca de evento por nome em Bloqueado por e outra em Bloqueia", async () => {
    install();
    renderRoute();
    await loaded();

    expect(screen.getByRole("searchbox", { name: "Buscar evento que bloqueia este" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar evento para bloquear" })).toBeInTheDocument();
  });

  it("a busca consulta a lista de tarefas pelo texto e não mostra o evento aberto", async () => {
    install();
    renderRoute();
    await loaded();

    search("Buscar evento que bloqueia este", "Treino");

    expect(await screen.findByRole("button", { name: "Escolher “Treino de peito”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Treino de força”" })).not.toBeInTheDocument();
  });

  it("escolher um bloqueador e Salvar grava o bloqueio no mesmo PATCH do título, e o bloqueador ganha revisão", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Treino de costas" } });
    search("Buscar evento que bloqueia este", "Jantar");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Jantar leve”" }));
    expect(within(blockedBy()).getByText("Jantar leve")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/events/ev-1",
        body: { expectedRevision: 3, name: "Treino de costas", blockedByEventIds: ["ev-3"] },
      }),
    ]);
    // O bloqueador é a origem da relação: a API sobe a revisão dele e o põe na lista do que ele bloqueia.
    const blocker = (await api.authedFetch("/api/events/ev-3")) as EventDto;
    expect(blocker.revision).toBe(2);
    expect(blocker.blocksEventIds).toEqual(["ev-1"]);
  });

  it("escolher um evento em Bloqueia manda blocksEventIds, e o evento bloqueado não é revisado", async () => {
    install();
    renderRoute();
    await loaded();

    search("Buscar evento para bloquear", "Treino de peito");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Treino de peito”" }));
    expect(within(blocks()).getByText("Treino de peito")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/events/ev-1", body: { expectedRevision: 3, blocksEventIds: ["ev-2"] } }),
    ]);
    const blocked = (await api.authedFetch("/api/events/ev-2")) as EventDto;
    expect(blocked.revision).toBe(1);
    expect(blocked.blockedByEventIds).toEqual(["ev-1"]);
  });

  it("cada bloqueio já ligado pode ser removido, e a remoção vai no Salvar", async () => {
    install([
      parent({ blockedByEventIds: ["ev-3"] }),
      other("ev-3", "Jantar leve", { kind: "meal", blocksEventIds: ["ev-1"] }),
    ]);
    renderRoute();
    await loaded();

    expect(await within(blockedBy()).findByText("Jantar leve")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deixar de ser bloqueado por “Jantar leve”" }));
    expect(within(blockedBy()).getByText("nenhum evento")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/events/ev-1", body: { expectedRevision: 3, blockedByEventIds: [] } }),
    ]);
    const blocker = (await api.authedFetch("/api/events/ev-3")) as EventDto;
    expect(blocker.blocksEventIds).toEqual([]);
    expect(blocker.revision).toBe(2);
  });

  it("uma recusa da API por ciclo mostra a mensagem, mantém o formulário e o bloqueio escolhido", async () => {
    install();
    api.failNext("PATCH", "/api/events/ev-1", 400);
    renderRoute();
    await loaded();

    search("Buscar evento para bloquear", "Treino de peito");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Treino de peito”" }));
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(REFUSED);
    expect(within(blocks()).getByText("Treino de peito")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
