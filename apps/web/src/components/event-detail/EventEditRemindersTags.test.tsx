import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { setField } from "@/components/edit/edit-test-helpers";
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

/** Um treino de hoje, em curso, com lembretes e tags de partida. Revisão 3. */
function training(overrides: Partial<TaskDto> = {}): TaskDto {
  return eventFixture({
    id: "ev-1",
    name: "Treino de força",
    kind: "training",
    status: "doing",
    priority: "medium",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    revision: 3,
    ...overrides,
  });
}

let api: FakeApi;

function install(events: TaskDto[]) {
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

/** Abre o "Adicionar lembrete", preenche a quantidade e a unidade, e confirma. */
function addReminder(amount: string, unit: "minutos" | "dias") {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar lembrete" }));
  fireEvent.change(screen.getByLabelText("Quantidade do lembrete"), { target: { value: amount } });
  setField("Unidade do lembrete", unit === "dias" ? "days" : "minutes");
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
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

describe("Lembrar antes de", () => {
  it("cada lembrete é um cartão com remover, em ordem crescente", async () => {
    install([training({ notifyOffsetsMinutes: [1440, 30] })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    const list = screen.getByRole("list", { name: "Lembretes" });
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual(["30 min", "1 dia"]);
    expect(screen.getByRole("button", { name: "Remover lembrete de 30 min antes" })).toBeInTheDocument();
  });

  it("remover um lembrete manda a lista sem ele, no mesmo Salvar", async () => {
    install([training({ notifyOffsetsMinutes: [30, 1440] })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.click(screen.getByRole("button", { name: "Remover lembrete de 30 min antes" }));
    expect(screen.queryByRole("button", { name: "Remover lembrete de 30 min antes" })).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, notifyOffsetsMinutes: [1440] });
  });

  it("adiciona um lembrete em dias e o manda no Salvar", async () => {
    install([training({ notifyOffsetsMinutes: [30] })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    addReminder("2", "dias");
    expect(screen.getByRole("button", { name: "Remover lembrete de 2 dias antes" })).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, notifyOffsetsMinutes: [30, 2880] });
  });

  it("aceita de 1 minuto a 30 dias: 31 dias é recusado no campo, sem entrar na lista", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    addReminder("31", "dias");

    expect(await screen.findByText("Use de 1 minuto a 30 dias.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Lembretes" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantidade do lembrete")).toBeInTheDocument();
  });

  it("um minuto é o menor lembrete aceito", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    addReminder("0", "minutos");
    expect(await screen.findByText("Use de 1 minuto a 30 dias.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Quantidade do lembrete"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByRole("button", { name: "Remover lembrete de 1 min antes" })).toBeInTheDocument();
  });
});

describe("Tags", () => {
  it("sugere tags pelo começo do nome, vindas da API", async () => {
    install([
      training({ tags: ["saúde"] }),
      eventFixture({ id: "ev-2", name: "Caminhada", tags: ["pessoal", "foco"] }),
    ]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.change(screen.getByLabelText("Nova tag"), { target: { value: "pe" } });

    const suggestions = await screen.findByRole("list", { name: "Sugestões de tags" });
    expect(within(suggestions).getAllByRole("button").map((button) => button.textContent)).toEqual(["#pessoal"]);
  });

  it("escolher uma sugestão põe a tag na lista e manda o conjunto no Salvar", async () => {
    install([
      training({ tags: ["saúde"] }),
      eventFixture({ id: "ev-2", name: "Caminhada", tags: ["pessoal"] }),
    ]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.change(screen.getByLabelText("Nova tag"), { target: { value: "pe" } });
    fireEvent.click(await screen.findByRole("button", { name: "#pessoal" }));

    expect(screen.getByRole("button", { name: "Remover tag pessoal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nova tag")).toHaveValue("");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, tags: ["saúde", "pessoal"] });
  });

  it("a tag digitada é gravada em minúsculas e sem espaços nas pontas", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.change(screen.getByLabelText("Nova tag"), { target: { value: "  Foco " } });
    fireEvent.keyDown(screen.getByLabelText("Nova tag"), { key: "Enter" });

    expect(screen.getByRole("button", { name: "Remover tag foco" })).toHaveTextContent("#foco");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, tags: ["foco"] });
  });

  it("remover uma tag manda a lista sem ela", async () => {
    install([training({ tags: ["saúde", "pessoal"] })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.click(screen.getByRole("button", { name: "Remover tag saúde" }));
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, tags: ["pessoal"] });
  });

  it("sem nada digitado e sem mudança, Salvar não envia nada", async () => {
    install([training({ tags: ["foco"], notifyOffsetsMinutes: [30] })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toHaveLength(0);
  });
});
