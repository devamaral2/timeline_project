import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** Um treino com duas subtarefas. Revisão 3 no pai e 2 em cada subtarefa, para conferir as revisões enviadas. */
function parent(overrides: Partial<EventDto> = {}): EventDto {
  return eventFixture({
    id: "ev-1",
    name: "Treino de força",
    kind: "training",
    status: "doing",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    revision: 3,
    subtaskEventIds: ["sub-1", "sub-2"],
    ...overrides,
  });
}

function child(id: string, name: string): EventDto {
  return eventFixture({ id, name, status: "todo", parentEventIds: ["ev-1"], revision: 2 });
}

const SEED = [parent(), child("sub-1", "Aquecer"), child("sub-2", "Alongar")];

let api: FakeApi;

function install(events: EventDto[] = SEED) {
  api = createFakeApi({ areas: [eventsArea], seed: { events } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderRoute() {
  return render(<EventEditRoute userId="user-1" eventId="ev-1" />);
}

/** Os pedidos que mudaram algo, na ordem em que saíram. */
function writes(): string[] {
  return api.calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.pathname}`);
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

async function loaded() {
  await screen.findByDisplayValue("Aquecer");
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

describe("subtarefas na edição", () => {
  it("Nova subtarefa acrescenta uma linha com nome editável, sem gravar nada", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Nova subtarefa" }));

    const names = screen.getAllByLabelText("Nome da subtarefa");
    expect(names).toHaveLength(3);
    expect(names[2]).toHaveValue("");
    expect(writes()).toEqual([]);
  });

  it("ao Salvar, a subtarefa nova vira um evento ligado ao evento aberto, e a revisão do pai sobe", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Nova subtarefa" }));
    fireEvent.change(screen.getAllByLabelText("Nome da subtarefa")[2], { target: { value: "Comprar faixa" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    const create = api.calls.find((call) => call.method === "POST");
    expect(create?.pathname).toBe("/api/events");
    expect(create?.idempotencyKey).toEqual(expect.any(String));
    expect(create?.body).toEqual({ kind: "routine", status: "todo", name: "Comprar faixa", parentEventIds: ["ev-1"] });
    // Nada do pai mudou, então o PATCH do pai não sai: só a criação.
    expect(writes()).toEqual(["POST /api/events"]);
    // A criação sobe a revisão do pai na API falsa, como na real: 3 vira 4.
    const after = (await api.authedFetch("/api/events/ev-1")) as EventDto;
    expect(after.revision).toBe(4);
    expect(after.subtaskEventIds).toHaveLength(3);
  });

  it("renomear uma subtarefa manda o PATCH dela com a revisão dela, e não toca no pai", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByDisplayValue("Aquecer"), { target: { value: "Aquecer bem" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(api.calls.filter((call) => call.method === "PATCH")).toEqual([
      expect.objectContaining({ pathname: "/api/events/sub-1", body: { expectedRevision: 2, name: "Aquecer bem" } }),
    ]);
    expect(writes()).toEqual(["PATCH /api/events/sub-1"]);
  });

  it("remover desfaz a ligação pelo pai, e a subtarefa continua existindo", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Remover subtarefa “Alongar”" }));
    expect(screen.queryByDisplayValue("Alongar")).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(api.calls.filter((call) => call.method === "PATCH")).toEqual([
      expect.objectContaining({
        pathname: "/api/events/ev-1",
        body: { expectedRevision: 3, subtaskEventIds: ["sub-1"] },
      }),
    ]);
    expect(writes()).toEqual(["PATCH /api/events/ev-1"]);
    // O evento da subtarefa segue lá, sem o pai na lista dele.
    const kept = (await api.authedFetch("/api/events/sub-2")) as EventDto;
    expect(kept.name).toBe("Alongar");
    expect(kept.parentEventIds).toEqual([]);
    expect(await api.authedFetch("/api/events/ev-1/subtasks")).toEqual([expect.objectContaining({ id: "sub-1" })]);
  });

  it("ao Salvar com tudo junto, o PATCH do pai sai primeiro, depois a renomeação, depois a criação", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Treino de peito" } });
    fireEvent.change(screen.getByDisplayValue("Aquecer"), { target: { value: "Aquecer bem" } });
    fireEvent.click(screen.getByRole("button", { name: "Remover subtarefa “Alongar”" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova subtarefa" }));
    fireEvent.change(screen.getAllByLabelText("Nome da subtarefa")[1], { target: { value: "Supino" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(writes()).toEqual(["PATCH /api/events/ev-1", "PATCH /api/events/sub-1", "POST /api/events"]);
  });

  it("Descartar não cria, não renomeia e não remove nada", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Nova subtarefa" }));
    fireEvent.change(screen.getByDisplayValue("Aquecer"), { target: { value: "Aquecer bem" } });
    fireEvent.click(screen.getByRole("button", { name: "Remover subtarefa “Alongar”" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(writes()).toEqual([]);
  });

  it("uma subtarefa nova sem nome não sai: a linha mostra o aviso e nada é enviado", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Nova subtarefa" }));
    save();

    expect(await screen.findByText("Dê um nome à subtarefa.")).toBeInTheDocument();
    expect(writes()).toEqual([]);
    expect(replace).not.toHaveBeenCalled();
  });
});
