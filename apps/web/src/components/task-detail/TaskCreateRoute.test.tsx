import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { fieldValue, getField, setField } from "@/components/edit/edit-test-helpers";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { eventsArea } from "@/test/fake-api/events";

const replace = vi.fn();
const push = vi.fn();
const back = vi.fn();
const route = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back }),
  useSearchParams: () => new URLSearchParams(route.search),
}));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskCreateRoute } = await import("./TaskCreateRoute");

let api: FakeApi;

function install() {
  api = createFakeApi({ areas: [eventsArea], seed: { events: [] } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderRoute() {
  return render(<TaskCreateRoute userId="user-1" />);
}

function posts() {
  return api.calls.filter((call) => call.method === "POST");
}

function created(): TaskDto[] {
  return [...api.store.table<TaskDto>("events").values()];
}

/** Os campos mudam pelo rótulo visível, como a pessoa os acha. */
function field(label: string): HTMLElement {
  return getField(label);
}

function type(label: string, value: string) {
  setField(label, value);
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

/** Com histórico, Salvar e Descartar voltam; sem ele (a rota aberta direto), vão para a agenda. */
function setHistoryLength(length: number) {
  Object.defineProperty(window.history, "length", { configurable: true, value: length });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
  replace.mockReset();
  back.mockReset();
  route.search = "";
  setHistoryLength(2);
  install();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formulário vazio", () => {
  it("abre com o cabeçalho Novo evento, todos os campos vazios e sem status", async () => {
    renderRoute();

    expect(await screen.findByRole("heading", { level: 1, name: "Novo evento" })).toBeInTheDocument();
    expect(field("Título")).toHaveValue("");
    expect(fieldValue("Tipo")).toBe("common");
    expect(fieldValue("Status")).toBe("");
    expect(fieldValue("Prioridade")).toBe("medium");
    expect(fieldValue("Data de início")).toBe("");
    expect(field("Descrição")).toHaveValue("");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Descartar", "Salvar"]);
  });

  it("?nome= põe o título, vindo de /evento comprar pão", async () => {
    route.search = "nome=Comprar%20p%C3%A3o";
    renderRoute();

    expect(await screen.findByRole("heading", { level: 1, name: "Novo evento" })).toBeInTheDocument();
    expect(field("Título")).toHaveValue("Comprar pão");
  });
});

describe("Salvar", () => {
  it("sem status, cria um evento de referência com o corpo preenchido e volta para a tela de onde veio", async () => {
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "Dentista");
    save();

    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.body).toEqual({ kind: "common", name: "Dentista", description: "", priority: "medium" });
    expect(created()).toHaveLength(1);
    expect(created()[0]).toMatchObject({ name: "Dentista", actor: "human" });
    expect(created()[0]?.status).toBeUndefined();
  });

  it("com tipo, status e início, manda o que a pessoa escolheu, com o início no fuso da timeline", async () => {
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "Treino de força");
    type("Tipo", "training");
    type("Status", "doing");
    type("Data de início", "2026-11-14");
    type("Hora de início", "18:30");
    save();

    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(posts()[0]?.body).toEqual({
      kind: "training", name: "Treino de força", description: "", priority: "medium", status: "doing", startedAt: "2026-11-14T21:30:00.000Z",
    });
  });

  it("um toque repetido em Salvar não cria dois eventos", async () => {
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "Dentista");
    save();
    // O botão passa a dizer "Salvando…" e fica travado: o segundo toque não manda outra requisição.
    fireEvent.click(screen.getByRole("button", { name: "Salvando…" }));

    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
    expect(created()).toHaveLength(1);
  });

  it("sem título não envia: o campo avisa e a tela continua aberta", async () => {
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "  ");
    save();

    expect(await screen.findByText("Dê um título ao evento.")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    expect(back).not.toHaveBeenCalled();
  });

  it("a API recusa a entrada: a mensagem aparece e o que foi digitado fica", async () => {
    api.failNext("POST", "/api/tasks", 400);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "Dentista");
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent("A API recusou alguma entrada. Confira os campos e tente de novo.");
    expect(field("Título")).toHaveValue("Dentista");
    expect(back).not.toHaveBeenCalled();
  });

  it("uma falha que não é de entrada mostra a mensagem de criar", async () => {
    api.failNext("POST", "/api/tasks", 500);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "Dentista");
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível criar o evento. Tente novamente.");
    expect(back).not.toHaveBeenCalled();
  });
});

describe("Descartar", () => {
  it("volta sem criar nada", async () => {
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    type("Título", "Dentista");
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(back).toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });

  it("sem histórico (a rota aberta direto), vai para a agenda", async () => {
    setHistoryLength(1);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Novo evento" });

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(replace).toHaveBeenCalledWith("/user-1");
    expect(back).not.toHaveBeenCalled();
  });
});
