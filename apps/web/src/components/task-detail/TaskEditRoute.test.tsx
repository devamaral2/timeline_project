import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { fieldValue, getField, setField } from "@/components/edit/edit-test-helpers";
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

const { TaskEditRoute } = await import("./TaskEditRoute");

const NAME = "Treino de força";
const DETAIL_PATH = "/user-1/eventos/ev-1";

/** Um treino de hoje, em curso, com descrição. Revisão 3 para a edição conferir a revisão lida. */
function training(overrides: Partial<TaskDto> = {}): TaskDto {
  return eventFixture({
    id: "ev-1",
    name: NAME,
    kind: "training",
    status: "doing",
    priority: "medium",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    description: "Foco em peito e tríceps.",
    revision: 3,
    ...overrides,
  });
}

let api: FakeApi;

function install(tasks: TaskDto[]) {
  api = createFakeApi({ areas: [eventsArea], seed: { events: tasks } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderRoute() {
  return render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
}

function patches() {
  return api.calls.filter((call) => call.method === "PATCH");
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
  replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("modo de edição", () => {
  it("o cabeçalho diz Editar evento, cada campo é uma entrada, e o rodapé tem só Descartar e Salvar", async () => {
    install([training()]);
    renderRoute();

    expect(await screen.findByRole("heading", { level: 1, name: "Editar evento" })).toBeInTheDocument();
    expect(fieldValue("Tipo")).toBe("training");
    expect(field("Título")).toHaveValue(NAME);
    expect(fieldValue("Status")).toBe("doing");
    expect(fieldValue("Prioridade")).toBe("medium");
    expect(fieldValue("Data de início")).toBe("2026-11-14");
    expect(fieldValue("Hora de início")).toBe("18:30");
    expect(fieldValue("Data de término")).toBe("2026-11-14");
    expect(fieldValue("Hora de término")).toBe("19:20");
    expect(field("Descrição")).toHaveValue("Foco em peito e tríceps.");
    // O rodapé tem só Descartar e Salvar; as seções de lembretes e tags têm os seus próprios botões.
    const footer = screen.getByRole("button", { name: "Descartar" }).parentElement as HTMLElement;
    expect(within(footer).getAllByRole("button").map((button) => button.textContent)).toEqual(["Descartar", "Salvar"]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("os tipos são os quatro de pessoa, e os status são os do evento mais Sem status", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.click(field("Tipo"));
    expect(within(screen.getByRole("listbox", { name: "Tipo" })).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Padrão", "Refeição", "Sono", "Treino",
    ]);
    fireEvent.click(field("Tipo"));
    fireEvent.click(field("Status"));
    const statuses = within(screen.getByRole("listbox", { name: "Status" }));
    expect(statuses.getByRole("option", { name: "Sem status" })).toBeInTheDocument();
    expect(statuses.getByRole("option", { name: "Não realizado" })).toBeInTheDocument();
  });
});

describe("Salvar", () => {
  it("manda só os campos que mudaram, com a revisão lida, e volta para a leitura", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "Treino de peito");
    type("Prioridade", "urgent");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, name: "Treino de peito", priority: "urgent" });
  });

  it("sem nenhuma mudança volta para a leitura sem enviar nada", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toHaveLength(0);
  });

  it("concluir envia o status com finishedAt do instante atual", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Status", "done");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    // O relógio falso anda sozinho: o instante exato não importa, só o dia e a hora.
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, status: "done", finishedAt: expect.stringMatching(/^2026-11-14T13:00:/) });
  });

  it("reabrir um evento feito manda finishedAt nulo", async () => {
    install([training({ status: "done", finishedAt: "2026-11-14T12:00:00.000Z" })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Status", "inHold");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, status: "inHold", finishedAt: null });
  });

  it("Sem status manda status nulo", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Status", "");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, status: null });
  });

  it("apagar a data de início remove o início do evento", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Data de início", "");
    type("Hora de início", "");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, startedAt: null });
  });

  it("uma data sem hora grava o início à meia-noite local", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    // Antes do término (14 nov, 19:20), para não cair na recusa de término antes do início.
    type("Data de início", "2026-11-13");
    type("Hora de início", "");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, startedAt: "2026-11-13T03:00:00.000Z" });
  });

  it("uma hora nova no início é gravada no fuso da timeline", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Hora de início", "19:00");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, startedAt: "2026-11-14T22:00:00.000Z" });
  });

  it("um título vazio não é enviado: o campo avisa e a tela continua aberta", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "  ");
    save();

    expect(await screen.findByText("Dê um título ao evento.")).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it("uma hora sem data e um término antes do início não são enviados", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Data de início", "");
    type("Hora de término", "18:00");
    save();

    expect(await screen.findByText("Informe a data para marcar a hora.", { exact: false })).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
  });
});

describe("Descartar", () => {
  it("volta para a leitura sem enviar nada", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "Outro nome");
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(replace).toHaveBeenCalledWith(DETAIL_PATH);
    expect(patches()).toHaveLength(0);
  });
});

describe("revisão desatualizada", () => {
  it("avisa, recarrega o evento e mantém o que a pessoa digitou", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "Meu título");
    // Outra tela mudou o evento antes deste salvar: a revisão lida (3) já não vale.
    api.store.table<TaskDto>("events").set("ev-1", training({ revision: 4, name: "Outro nome", priority: "high" }));
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent("Este evento mudou em outro lugar.");
    expect(field("Título")).toHaveValue("Meu título");
    // O campo que a pessoa não mexeu mostra a versão nova.
    expect(fieldValue("Prioridade")).toBe("high");
    expect(replace).not.toHaveBeenCalled();
  });

  it("salvar de novo usa a revisão recarregada e manda só o que a pessoa mudou", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "Meu título");
    api.store.table<TaskDto>("events").set("ev-1", training({ revision: 4, name: "Outro nome", priority: "high" }));
    save();
    await screen.findByRole("alert");

    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[1]?.body).toEqual({ expectedRevision: 4, name: "Meu título" });
  });
});

describe("entrada recusada pela API", () => {
  it("aparece como mensagem no formulário, sem perder o que foi digitado", async () => {
    install([training()]);
    api.failNext("PATCH", "/api/tasks/ev-1", 400);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "Meu título");
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent("A API recusou alguma entrada. Confira os campos e tente de novo.");
    expect(field("Título")).toHaveValue("Meu título");
    expect(replace).not.toHaveBeenCalled();
  });

  it("falha que não é de entrada mostra a mensagem geral", async () => {
    install([training()]);
    api.failNext("PATCH", "/api/tasks/ev-1", 500);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Título", "Meu título");
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar o evento. Tente novamente.");
    expect(field("Título")).toHaveValue("Meu título");
  });
});

describe("tarefa persistente", () => {
  const SIM = "Sim";
  const NAO = "Não";

  function persistentChoice(label: string): HTMLElement {
    return within(screen.getByRole("group", { name: "Tarefa persistente" })).getByRole("button", { name: label });
  }

  it("Não é o valor atual de um evento comum, e Sim e Não trocam o botão marcado", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    expect(persistentChoice(NAO)).toHaveAttribute("aria-pressed", "true");
    expect(persistentChoice(SIM)).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(persistentChoice(SIM));
    expect(persistentChoice(SIM)).toHaveAttribute("aria-pressed", "true");
    expect(persistentChoice(NAO)).toHaveAttribute("aria-pressed", "false");
  });

  it("ligar troca Término por Previsão de entrega, e salvar manda só longRunning", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.click(persistentChoice(SIM));

    expect(fieldValue("Data da previsão de entrega")).toBe("2026-11-14");
    expect(screen.queryByLabelText("Data de término")).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, longRunning: true });
  });

  it("desligar volta a Término, e salvar manda longRunning falso", async () => {
    install([training({ longRunning: true })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.click(persistentChoice(NAO));

    expect(fieldValue("Data de término")).toBe("2026-11-14");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()[0]?.body).toEqual({ expectedRevision: 3, longRunning: false });
  });

  it("evento longo com status Não realizado é recusado no status, sem enviar", async () => {
    install([training({ status: "missed" })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    fireEvent.click(persistentChoice(SIM));
    save();

    expect(await screen.findByText("Tarefa persistente precisa de um status: não pode ficar sem status nem como não realizado.")).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it("sem ser longo, um bloco de mais de 31 dias é recusado com a sugestão, e não envia", async () => {
    install([training()]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    type("Data de término", "2026-12-20");
    save();

    expect(await screen.findByText(/marque como tarefa persistente/)).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
  });

  it("evento longo sem previsão de entrega não oferece lembrete, e um lembrete que sobra é recusado", async () => {
    install([training({ longRunning: true, estimatedFinishAt: undefined, notifyOffsetsMinutes: [30] })]);
    renderRoute();
    await screen.findByRole("heading", { level: 1, name: "Editar evento" });

    expect(screen.queryByRole("button", { name: "Adicionar lembrete" })).not.toBeInTheDocument();
    expect(screen.getByText("Sem previsão de entrega não há lembrete.")).toBeInTheDocument();
    save();

    expect(await screen.findByText("Tarefa persistente sem previsão de entrega não tem lembrete.")).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
  });
});

describe("casos de tela", () => {
  it("evento inexistente mostra a tela de não encontrado", async () => {
    install([]);
    renderRoute();

    expect(await screen.findByRole("alert")).toHaveTextContent("Evento não encontrado.");
  });

  it("evento de agente não se edita aqui", async () => {
    install([eventFixture({ id: "ev-1", actor: "agent", kind: "request", status: "running", priority: "medium", name: "Pesquisar voos" })]);
    renderRoute();

    expect(await screen.findByRole("status")).toHaveTextContent("Este evento é do agente e não se edita aqui.");
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });
});
