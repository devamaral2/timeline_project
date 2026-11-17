import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskEditRoute } = await import("./TaskEditRoute");

const DETAIL_PATH = "/user-1/tarefas/ev-1";
const REFUSED = "A API recusou alguma entrada. Confira os campos e tente de novo.";

/** A tarefa aberta: um treino de hoje, revisão 3 para conferir a revisão enviada. */
function parent(overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({
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

/** Outras tarefas da busca: revisão 1 e status a fazer, que é o que a lista de tarefas devolve. */
function other(id: string, name: string, overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({ id, name, status: "todo", startedAt: "2026-11-14T20:00:00-03:00", revision: 1, ...overrides });
}

/** Uma tarefa de agente: a hierarquia liga pessoa e agente nas duas pontas. */
const AGENT = taskFixture({
  id: "ag-1",
  actor: "agent",
  kind: "request",
  status: "done",
  name: "Monitorar a aplicação",
  startedAt: "2026-11-14T08:00:00-03:00",
});

const SEED = [parent(), other("ev-2", "Treino de peito", { kind: "training" }), other("ev-3", "Jantar leve", { kind: "meal" }), AGENT];

let api: FakeApi;

function install(tasks: TaskDto[] = SEED) {
  api = createFakeApi({ areas: [tasksArea, requestsArea()], seed: { tasks: tasks } });
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
  await screen.findByRole("heading", { level: 1, name: "Editar tarefa" });
}

async function readTask(id: string) {
  return (await api.authedFetch(`/api/tasks/${id}`)) as TaskDto;
}

const PARENT_SEARCH = "Buscar tarefa principal";
const SUBTASK_SEARCH = "Buscar subtarefa";

/** O "+" de cada seção, pelo nome da busca do modal que ele abre. */
const ADD_BUTTONS: Record<string, string> = {
  [PARENT_SEARCH]: "Escolher a tarefa principal",
  [SUBTASK_SEARCH]: "Adicionar subtarefa",
};

/** Abre o modal de seleção de uma das duas seções pelo "+" dela. */
function openPicker(label: string) {
  fireEvent.click(screen.getByRole("button", { name: ADD_BUTTONS[label] }));
}

/** A busca de uma das duas seções: abrir o modal pelo "+", digitar o texto e esperar a lista de resultados. */
function search(label: string, text: string) {
  openPicker(label);
  fireEvent.change(screen.getByRole("searchbox", { name: label }), { target: { value: text } });
}

async function choose(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Escolher “${name}”` }));
}

function parentSection() {
  return screen.getByRole("region", { name: "Tarefa principal" });
}

function subtasksSection() {
  return screen.getByRole("region", { name: "Subtarefas" });
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

describe("tarefa principal e subtarefas na edição", () => {
  it("cada seção tem um + que abre o modal de seleção com a busca dela; fechar não escolhe nada", async () => {
    install();
    renderRoute();
    await loaded();

    // Sem abrir o modal, não há campo de busca na tela.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(parentSection()).getByText("nenhuma tarefa principal")).toBeInTheDocument();
    expect(within(subtasksSection()).getByText("nenhuma subtarefa")).toBeInTheDocument();

    openPicker(PARENT_SEARCH);
    expect(screen.getByRole("dialog", { name: "Tarefa principal" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: PARENT_SEARCH })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openPicker(SUBTASK_SEARCH);
    expect(screen.getByRole("dialog", { name: "Subtarefas" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: SUBTASK_SEARCH })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(patches()).toEqual([]);
  });

  it("a tarefa principal é um lugar só: escolhida, o + some e ela aparece com o x", async () => {
    install();
    renderRoute();
    await loaded();

    openPicker(PARENT_SEARCH);
    await choose("Jantar leve");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(parentSection()).getByText("Jantar leve")).toBeInTheDocument();
    expect(within(parentSection()).queryByRole("button", { name: "Escolher a tarefa principal" })).not.toBeInTheDocument();
    expect(within(parentSection()).getByRole("button", { name: "Tirar “Jantar leve” como tarefa principal" })).toBeInTheDocument();
  });

  it("a busca consulta a lista de tarefas pelo texto e não mostra a tarefa aberta", async () => {
    install();
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "Treino");

    expect(await screen.findByRole("button", { name: "Escolher “Treino de peito”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Treino de força”" })).not.toBeInTheDocument();
  });

  it("a principal escolhida não é oferecida como subtarefa, e as subtarefas não são oferecidas como principal", async () => {
    install();
    renderRoute();
    await loaded();

    openPicker(PARENT_SEARCH);
    await choose("Jantar leve");
    openPicker(SUBTASK_SEARCH);
    await choose("Treino de peito");

    openPicker(SUBTASK_SEARCH);
    expect(await screen.findByRole("button", { name: "Escolher “Monitorar a aplicação”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Jantar leve”" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Treino de peito”" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    fireEvent.click(screen.getByRole("button", { name: "Tirar “Jantar leve” como tarefa principal" }));
    openPicker(PARENT_SEARCH);
    expect(await screen.findByRole("button", { name: "Escolher “Jantar leve”" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Treino de peito”" })).not.toBeInTheDocument();
  });

  it("a busca acha também tarefa de agente, sem filtrar por ator", async () => {
    install();
    renderRoute();
    await loaded();

    search(PARENT_SEARCH, "Monitorar");

    expect(await screen.findByRole("button", { name: "Escolher “Monitorar a aplicação”" })).toBeInTheDocument();
    const lookup = api.calls.find((call) => call.pathname === "/api/tasks/tracked");
    expect(lookup?.query).not.toHaveProperty("actor");
  });

  it("escolher a principal e Salvar grava parentTaskId no mesmo PATCH do título, sem revisar a principal", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Treino de costas" } });
    search(PARENT_SEARCH, "Jantar");
    await choose("Jantar leve");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/tasks/ev-1",
        body: { expectedRevision: 3, name: "Treino de costas", parentTaskId: "ev-3" },
      }),
    ]);
    // A API liga a outra ponta, mas só a tarefa do PATCH sobe a revisão.
    const principal = await readTask("ev-3");
    expect(principal.revision).toBe(1);
    expect(principal.subtaskIds).toEqual(["ev-1"]);
  });

  it("escolher uma subtarefa manda subtaskIds, e a subtarefa não é revisada", async () => {
    install();
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "Treino de peito");
    await choose("Treino de peito");
    expect(within(subtasksSection()).getByText("Treino de peito")).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/tasks/ev-1", body: { expectedRevision: 3, subtaskIds: ["ev-2"] } }),
    ]);
    const subtask = await readTask("ev-2");
    expect(subtask.revision).toBe(1);
    expect(subtask.parentTaskId).toBe("ev-1");
  });

  it("uma subtarefa que estava sob outra principal muda para esta", async () => {
    install([
      parent(),
      other("ev-2", "Treino de peito", { subtaskIds: ["ev-3"] }),
      other("ev-3", "Jantar leve", { kind: "meal", parentTaskId: "ev-2" }),
    ]);
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "Jantar");
    await choose("Jantar leve");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect((await readTask("ev-3")).parentTaskId).toBe("ev-1");
    expect((await readTask("ev-1")).subtaskIds).toEqual(["ev-3"]);
    const formerParent = await readTask("ev-2");
    expect(formerParent.subtaskIds).toEqual([]);
    expect(formerParent.revision).toBe(1);
  });

  it("uma tarefa de agente pode ser a principal", async () => {
    install();
    renderRoute();
    await loaded();

    search(PARENT_SEARCH, "Monitorar");
    await choose("Monitorar a aplicação");
    expect(within(parentSection()).getByText("Monitorar a aplicação")).toBeInTheDocument();
    expect(within(parentSection()).getByRole("img", { name: "Agente, feito" })).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/tasks/ev-1", body: { expectedRevision: 3, parentTaskId: "ag-1" } }),
    ]);
  });

  it("a principal e as subtarefas vão juntas no mesmo PATCH", async () => {
    install();
    renderRoute();
    await loaded();

    search(PARENT_SEARCH, "Monitorar");
    await choose("Monitorar a aplicação");
    search(SUBTASK_SEARCH, "Jantar");
    await choose("Jantar leve");
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/tasks/ev-1",
        body: { expectedRevision: 3, parentTaskId: "ag-1", subtaskIds: ["ev-3"] },
      }),
    ]);
  });

  it("tirar a tarefa principal manda parentTaskId null e volta o +", async () => {
    install([
      parent({ parentTaskId: "ev-3" }),
      other("ev-3", "Jantar leve", { kind: "meal", subtaskIds: ["ev-1"] }),
    ]);
    renderRoute();
    await loaded();

    expect(await within(parentSection()).findByText("Jantar leve")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tirar “Jantar leve” como tarefa principal" }));
    expect(within(parentSection()).getByText("nenhuma tarefa principal")).toBeInTheDocument();
    expect(within(parentSection()).getByRole("button", { name: "Escolher a tarefa principal" })).toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/tasks/ev-1", body: { expectedRevision: 3, parentTaskId: null } }),
    ]);
    const former = await readTask("ev-3");
    expect(former.subtaskIds).toEqual([]);
    expect(former.revision).toBe(1);
    expect((await readTask("ev-1")).parentTaskId).toBeUndefined();
  });

  it("remover uma subtarefa manda subtaskIds sem ela", async () => {
    install([
      parent({ subtaskIds: ["ev-2", "ev-3"] }),
      other("ev-2", "Treino de peito", { parentTaskId: "ev-1" }),
      other("ev-3", "Jantar leve", { parentTaskId: "ev-1" }),
    ]);
    renderRoute();
    await loaded();

    expect(await within(subtasksSection()).findByText("Treino de peito")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover a subtarefa “Treino de peito”" }));
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({ pathname: "/api/tasks/ev-1", body: { expectedRevision: 3, subtaskIds: ["ev-3"] } }),
    ]);
    expect((await readTask("ev-2")).parentTaskId).toBeUndefined();
  });

  it("um ciclo é recusado pela API: a mensagem aparece e o formulário fica com a escolha", async () => {
    // ev-2 é a principal de ev-3, que é a principal de ev-1: ev-2 como subtarefa de ev-1 fecharia um ciclo.
    install([
      parent({ parentTaskId: "ev-3" }),
      other("ev-2", "Treino de peito", { subtaskIds: ["ev-3"] }),
      other("ev-3", "Jantar leve", { kind: "meal", parentTaskId: "ev-2", subtaskIds: ["ev-1"] }),
    ]);
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "Treino de peito");
    await choose("Treino de peito");
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(REFUSED);
    expect(within(subtasksSection()).getByText("Treino de peito")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect((await readTask("ev-2")).parentTaskId).toBeUndefined();
  });
});

describe("criar a tarefa ligada pelo modal de seleção", () => {
  /** O pedido que o "Pedir ao Hermes" abriu: o id sai da primeira leitura dele. */
  async function openedRequestId(): Promise<string> {
    let id = "";
    await waitFor(() => {
      const read = api.calls.find((call) => call.method === "GET" && call.pathname.startsWith("/api/requests/"));
      expect(read).toBeDefined();
      id = read?.pathname.slice("/api/requests/".length) ?? "";
    });
    return id;
  }

  it("sem texto na busca, criar e pedir ao Hermes ficam desligados", async () => {
    install();
    renderRoute();
    await loaded();

    openPicker(SUBTASK_SEARCH);

    expect(screen.getByRole("button", { name: "Criar tarefa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pedir ao Hermes" })).toBeDisabled();
  });

  it("Criar faz a tarefa a fazer com o nome da busca e a liga como subtarefa; Salvar grava a ligação", async () => {
    install();
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "  Comprar tinta ");
    fireEvent.click(screen.getByRole("button", { name: "Criar “Comprar tinta”" }));

    expect(await within(subtasksSection()).findByText("Comprar tinta")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const post = api.calls.find((call) => call.method === "POST" && call.pathname === "/api/tasks");
    expect(post?.body).toMatchObject({ kind: "common", name: "Comprar tinta", status: "todo" });

    save();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    const created = (patches()[0]?.body as { subtaskIds: string[] }).subtaskIds;
    expect(created).toHaveLength(1);
    expect((await readTask(created[0] as string)).parentTaskId).toBe("ev-1");
  });

  it("Criar na tarefa principal ocupa o lugar dela", async () => {
    install();
    renderRoute();
    await loaded();

    search(PARENT_SEARCH, "Reformar a casa");
    fireEvent.click(screen.getByRole("button", { name: "Criar “Reformar a casa”" }));

    expect(await within(parentSection()).findByText("Reformar a casa")).toBeInTheDocument();
    expect(within(parentSection()).queryByRole("button", { name: "Escolher a tarefa principal" })).not.toBeInTheDocument();
  });

  it("Pedir ao Hermes manda o texto e liga as tarefas de cima que o pedido criou", async () => {
    // O pedido cria ev-5 e ev-6; ev-7 é subtarefa de ev-6 no próprio pedido e fica onde está.
    install([
      ...SEED,
      other("ev-5", "Comprar tinta"),
      other("ev-6", "Pintar a sala", { subtaskIds: ["ev-7"] }),
      other("ev-7", "Afastar os móveis", { parentTaskId: "ev-6" }),
    ]);
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "comprar tinta e pintar a sala");
    fireEvent.click(screen.getByRole("button", { name: "Pedir ao Hermes" }));
    const id = await openedRequestId();
    const start = api.calls.find((call) => call.method === "POST" && call.pathname === "/api/requests");
    expect(start?.body).toMatchObject({ userId: "user-1", text: "comprar tinta e pintar a sala" });
    expect(await screen.findByRole("status")).toBeInTheDocument();

    const entity = (taskId: string, name: string) => ({ kind: "task" as const, id: taskId, name, operation: "create" as const, linkedTo: [] });
    advanceRequest(api, id, {
      status: "done",
      entities: [entity("ev-5", "Comprar tinta"), entity("ev-6", "Pintar a sala"), entity("ev-7", "Afastar os móveis")],
    });
    await vi.advanceTimersByTimeAsync(3000);

    expect(await within(subtasksSection()).findByText("Comprar tinta")).toBeInTheDocument();
    expect(within(subtasksSection()).getByText("Pintar a sala")).toBeInTheDocument();
    expect(within(subtasksSection()).queryByText("Afastar os móveis")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("um pedido que não cria tarefa avisa e deixa o modal aberto", async () => {
    install();
    renderRoute();
    await loaded();

    search(SUBTASK_SEARCH, "o que tenho hoje?");
    fireEvent.click(screen.getByRole("button", { name: "Pedir ao Hermes" }));
    const id = await openedRequestId();
    advanceRequest(api, id, { status: "done", entities: [] });
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByRole("alert")).toHaveTextContent("O Hermes não criou nenhuma tarefa com esse pedido.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(subtasksSection()).getByText("nenhuma subtarefa")).toBeInTheDocument();
  });
});
