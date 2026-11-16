import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto, RecurrenceDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { fieldValue, setField } from "@/components/edit/edit-test-helpers";
import { eventFixture, eventsArea } from "@/test/fake-api/events";
import { recurrenceFixture, recurrencesArea } from "@/test/fake-api/recurrences";

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
const { TaskEditRoute } = await import("./TaskEditRoute");

const DETAIL_PATH = "/user-1/eventos/ev-1";
const REFUSED = "A API recusou alguma entrada. Confira os campos e tente de novo.";
const START_TIME = "Informe a hora: a série se repete nesse horário.";
const PILL = "Recorrência: Seg, qua e sex, 18:30. Trocar";
/** Seg (2) + qua (8) + sex (32). */
const WEEKDAYS_MASK = 42;

/** A regra da série como a ocorrência a vê: a mesma que a série guarda. */
const RULE = {
  frequency: "weekly" as const,
  interval: 1,
  byWeekday: WEEKDAYS_MASK,
  timeOfDay: "18:30",
  durationMinutes: 50,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-11-03",
};

let api: FakeApi;

function install(tasks: TaskDto[], recurrences: RecurrenceDto[] = []) {
  api = createFakeApi({ areas: [eventsArea, recurrencesArea], seed: { events: tasks, recurrences } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function series(overrides: Partial<RecurrenceDto> = {}): RecurrenceDto {
  return recurrenceFixture({
    id: "rec-1",
    ...RULE,
    template: { name: "Treino de força", kind: "training", priority: "medium", description: "" },
    revision: 1,
    ...overrides,
  });
}

/** Uma ocorrência da série: o evento leva a regra e o id da série. */
function occurrence(overrides: Partial<TaskDto> = {}): TaskDto {
  return eventFixture({
    id: "ev-1",
    name: "Treino de força",
    kind: "training",
    status: "doing",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    recurrence: { id: "rec-1", occurrenceOn: "2026-11-14", detached: false, rule: RULE },
    revision: 3,
    ...overrides,
  });
}

function writes(): string[] {
  return api.calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.pathname}`);
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

function renderEdit() {
  return render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
  replace.mockReset();
  back.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recorrência na criação", () => {
  it("com a regra definida, Salvar cria a série com o modelo do formulário, e não um evento", async () => {
    install([]);
    render(<TaskCreateRoute userId="user-1" />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Corrida" } });
    setField("Data de início", "2026-11-16");
    setField("Hora de início", "18:30");
    setField("Data de término", "2026-11-16");
    setField("Hora de término", "19:20");
    fireEvent.click(screen.getByRole("button", { name: "Definir a regra" }));
    save();

    await waitFor(() => expect(writes()).toEqual(["POST /api/recurrences"]));
    const create = api.calls.find((call) => call.method === "POST");
    expect(create?.idempotencyKey).toEqual(expect.any(String));
    // Semanal, no dia do início (16 de novembro é segunda: bit 1 = 2); hora e duração vêm do formulário.
    expect(create?.body).toEqual({
      frequency: "weekly",
      interval: 1,
      byWeekday: 2,
      timeOfDay: "18:30",
      durationMinutes: 50,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startsOn: "2026-11-16",
      template: { kind: "common", name: "Corrida", description: "", priority: "medium" },
    });
    expect(api.store.table<RecurrenceDto>("recurrences").size).toBe(1);
  });

  it("a regra sem hora de início não sai: a tela pede a hora", async () => {
    install([]);
    render(<TaskCreateRoute userId="user-1" />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Corrida" } });
    setField("Data de início", "2026-11-16");
    fireEvent.click(screen.getByRole("button", { name: "Definir a regra" }));
    save();

    expect(await screen.findByText(START_TIME)).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });
});

describe("recorrência na edição", () => {
  it("num evento avulso, a linha diz que não se repete e oferece definir a regra", async () => {
    install([eventFixture({ id: "ev-1", name: "Comprar pão", startedAt: "2026-11-14T18:30:00-03:00", revision: 1 })]);
    renderEdit();

    await screen.findByDisplayValue("Comprar pão");
    expect(screen.getByText("Não se repete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Recorrência:/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Definir a regra" })).toBeInTheDocument();
  });

  it("num evento avulso, definir a regra e Salvar grava o evento e cria a série a partir do dia seguinte", async () => {
    install([eventFixture({
      id: "ev-1",
      name: "Comprar pão",
      startedAt: "2026-11-14T18:30:00-03:00",
      estimatedFinishAt: "2026-11-14T19:20:00-03:00",
      revision: 1,
    })]);
    renderEdit();

    await screen.findByDisplayValue("Comprar pão");
    fireEvent.click(screen.getByRole("button", { name: "Definir a regra" }));
    console.log("DBG", screen.getByText("Recorrência").parentElement?.textContent);
    expect(screen.getByText(/Este evento fica como está/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Comprar pão francês" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(writes()).toEqual(["POST /api/recurrences", "PATCH /api/tasks/ev-1"]);
    const create = api.calls.find((call) => call.method === "POST");
    // 14 de novembro de 2026 é sábado (bit 6): a série começa no domingo 15, e o evento de hoje não ganha uma cópia.
    expect(create?.body).toMatchObject({
      frequency: "weekly",
      interval: 1,
      byWeekday: 64,
      timeOfDay: "18:30",
      durationMinutes: 50,
      startsOn: "2026-11-15",
      template: { name: "Comprar pão francês" },
    });
  });

  it("num evento avulso, a regra sem data de início não sai: a tela pede a data", async () => {
    install([eventFixture({ id: "ev-1", name: "Comprar pão", revision: 1 })]);
    renderEdit();

    await screen.findByDisplayValue("Comprar pão");
    fireEvent.click(screen.getByRole("button", { name: "Definir a regra" }));
    save();

    expect(await screen.findByText("Informe a data de início: a série começa nela.")).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it("numa ocorrência, a linha mostra a regra e a série; Trocar e Salvar mandam só a regra que mudou, com a revisão da série", async () => {
    install([occurrence()], [series()]);
    renderEdit();

    fireEvent.click(await screen.findByRole("button", { name: PILL }));
    expect(screen.getByText("desde 3 nov · sem fim · esta ocorrência segue a série")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Repetir a cada"), { target: { value: "2" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    // Só a série sai: o evento não mudou, então o PATCH do evento não vai.
    expect(writes()).toEqual(["PATCH /api/recurrences/rec-1"]);
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ expectedRevision: 1, interval: 2 });
    const after = (await api.authedFetch("/api/recurrences/rec-1")) as RecurrenceDto;
    expect(after.revision).toBe(2);
    expect(after.interval).toBe(2);
  });

  it("trocar a semanal para mensal é recusado pela API: a tela avisa e mantém o formulário", async () => {
    install([occurrence()], [series()]);
    renderEdit();

    fireEvent.click(await screen.findByRole("button", { name: PILL }));
    setField("Frequência", "monthly");
    save();

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(fieldValue("Frequência")).toBe("monthly");
  });

  it("apagar a série pede confirmação antes do DELETE, e depois a linha diz que ela já não existe", async () => {
    install([occurrence()], [series()]);
    renderEdit();

    await screen.findByRole("button", { name: PILL });
    fireEvent.click(screen.getByRole("button", { name: "Apagar a série" }));
    expect(writes()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Sim, apagar a série" }));

    expect(await screen.findByText("A série já não existe.")).toBeInTheDocument();
    expect(writes()).toEqual(["DELETE /api/recurrences/rec-1"]);
    expect(api.store.table<RecurrenceDto>("recurrences").has("rec-1")).toBe(false);
  });

  it("com a tarefa persistente ligada, a linha Recorrência some", async () => {
    install([occurrence()], [series()]);
    renderEdit();

    await screen.findByRole("button", { name: PILL });
    expect(screen.getByText("Recorrência")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Tarefa persistente" })).getByRole("button", { name: "Sim" }));

    expect(screen.queryByText("Recorrência")).toBeNull();
  });
});
