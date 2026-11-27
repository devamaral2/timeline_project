import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDto, RecurrenceDto, TaskCardDto, TaskDto } from "@repo/contracts";
import { setField } from "@/components/edit/edit-test-helpers";
import { TaskRow } from "@/components/tasks/task-row";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { FAKE_PERSONAL_PROJECT, projectsArea } from "@/test/fake-api/projects";
import { recurrenceFixture, recurrencesArea } from "@/test/fake-api/recurrences";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const replace = vi.fn();
const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskCreateRoute } = await import("./TaskCreateRoute");
const { TaskEditRoute } = await import("./TaskEditRoute");

const BRAID: ProjectDto = { id: "project-braid", name: "braid", personal: false };
const ALFA: ProjectDto = { id: "project-alfa", name: "Alfa", personal: false };
const ZETA: ProjectDto = { id: "project-zeta", name: "zeta", personal: false };

let api: FakeApi;

function install(tasks: TaskDto[] = []) {
  api = createFakeApi({
    areas: [tasksArea, projectsArea, recurrencesArea],
    seed: { tasks, projects: [ZETA, BRAID, ALFA] },
  });
  net.authedFetch.mockImplementation(api.authedFetch);
}

/** Uma tarefa do braid, em curso, que a edição abre. */
function inBraid(overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({ id: "ev-1", name: "Revisar o PR", status: "doing", project: BRAID, revision: 3, ...overrides });
}

const FIELD_NAME = (project: string) => `Projeto: ${project}. Trocar`;
const projectField = (project: string) => screen.getByRole("button", { name: FIELD_NAME(project) });
const dialog = () => screen.getByRole("dialog", { name: "Projeto" });

function openChoice(current = "personal") {
  fireEvent.click(projectField(current));
  return dialog();
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

function writes() {
  return api.calls.filter((call) => call.method !== "GET");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
  replace.mockReset();
  back.mockReset();
  Object.defineProperty(window.history, "length", { configurable: true, value: 2 });
  install();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Os nomes dos projetos que a lista da escolha mostra, na ordem. */
function listed(): string[] {
  return within(screen.getByRole("list", { name: /Resultados/ }))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label")?.replace(/^Escolher “(.*)”$/, "$1") ?? "");
}

describe("criação", () => {
  it("o formulário começa em personal, com a marca e o nome, e sem buscar nada", async () => {
    render(<TaskCreateRoute userId="user-1" />);

    const button = await screen.findByRole("button", { name: FIELD_NAME("personal") });
    expect(button).toHaveTextContent("personal");
    expect(button.querySelector("[data-project-mark]")).toHaveAttribute("data-personal", "true");
    expect(api.calls).toEqual([]);
  });

  it("salvar sem escolher deixa a tarefa em personal, sem projectId no corpo", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });

    setField("Título", "Dentista");
    save();

    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(writes()[0]?.body).not.toHaveProperty("projectId");
    expect([...api.store.table<TaskDto>("tasks").values()][0]?.project).toEqual(FAKE_PERSONAL_PROJECT);
  });

  it("a escolha abre com personal primeiro e os outros por nome", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });

    openChoice();

    await waitFor(() => expect(listed()).toEqual(["personal", "Alfa", "braid", "zeta"]));
  });

  it("escolher outro projeto o mostra no campo, e salvar manda o projectId e deixa a tarefa nele", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });

    openChoice();
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “braid”" }));

    // O modal fecha e o campo mostra a marca e o nome do escolhido.
    expect(screen.queryByRole("dialog", { name: "Projeto" })).not.toBeInTheDocument();
    const button = projectField("braid");
    expect(button).toHaveTextContent("braid");
    expect(button.querySelector("[data-project-mark]")).toHaveAttribute("data-personal", "false");
    expect(button.querySelector("[data-project-mark]")).toHaveTextContent("BR");

    setField("Título", "Dentista");
    save();

    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(writes()[0]?.body).toMatchObject({ name: "Dentista", projectId: "project-braid" });
    expect([...api.store.table<TaskDto>("tasks").values()][0]?.project).toEqual(BRAID);
  });

  it("depois de salvar, a linha da tarefa mostra o projeto escolhido", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Alfa”" }));
    setField("Título", "Dentista");
    save();
    await waitFor(() => expect(back).toHaveBeenCalled());

    const card = JSON.parse(JSON.stringify([...api.store.table<TaskDto>("tasks").values()][0])) as TaskCardDto;
    render(<ul><TaskRow card={card} userId="user-1" now={new Date()} /></ul>);

    const mark = document.querySelector("[data-row-side] [data-project-mark]");
    expect(mark).toHaveAccessibleName("Alfa");
    expect(mark).toHaveTextContent("AL");
  });

  it("a busca filtra pelo nome, sem distinguir maiúsculas nem acentos, e avisa quando nada serve", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();
    await waitFor(() => expect(listed()).toHaveLength(4));

    fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Buscar projeto" }), { target: { value: "ALF" } });
    await waitFor(() => expect(listed()).toEqual(["Alfa"]));

    fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Buscar projeto" }), { target: { value: "inexistente" } });
    expect(await within(dialog()).findByText("Nada encontrado para essa busca.")).toBeInTheDocument();
  });

  it("criar um projeto com o texto da busca o escolhe, e salvar manda o id dele", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();

    fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Buscar projeto" }), { target: { value: "  timeline_project " } });
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Criar “timeline_project”" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Projeto" })).not.toBeInTheDocument());
    const created = [...api.store.table<ProjectDto>("projects").values()].find((project) => project.name === "timeline_project");
    expect(created).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")).toMatchObject({ pathname: "/api/projects", body: { name: "timeline_project" } });
    expect(projectField("timeline_project").querySelector("[data-project-mark]")).toHaveTextContent("TP");

    setField("Título", "Dentista");
    save();
    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(writes().at(-1)?.body).toMatchObject({ projectId: created?.id });
  });

  it("sem texto na busca, criar fica desligado e a dica pede o nome", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });

    openChoice();

    expect(within(dialog()).getByRole("button", { name: "Criar projeto" })).toBeDisabled();
    expect(within(dialog()).getByText("Escreva na busca o nome do projeto novo.")).toBeInTheDocument();
  });

  it("um nome repetido mostra a mensagem e não fecha a escolha", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();

    fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Buscar projeto" }), { target: { value: "BRAID" } });
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Criar “BRAID”" }));

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("Já existe um projeto com esse nome");
    expect(dialog()).toBeInTheDocument();
    expect(projectField("personal")).toBeInTheDocument();
    expect(api.store.table("projects").size).toBe(3);
  });

  it("o nome grande demais mostra o limite e não fecha a escolha", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();

    fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Buscar projeto" }), { target: { value: "a".repeat(61) } });
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Criar “a+”$/ }));

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("tem de 1 a 60 caracteres");
    expect(dialog()).toBeInTheDocument();
  });

  it("Esc e o toque no X fecham a escolha sem mudar o projeto", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();

    fireEvent.click(within(dialog()).getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog", { name: "Projeto" })).not.toBeInTheDocument();
    expect(projectField("personal")).toBeInTheDocument();
  });

  it("uma série criada pelo formulário leva o projeto no modelo, para as ocorrências nascerem nele", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “braid”" }));

    setField("Título", "Corrida");
    setField("Data de início", "2026-11-16");
    setField("Hora de início", "18:30");
    fireEvent.click(screen.getByRole("button", { name: "Definir a regra" }));
    save();

    await waitFor(() => expect(writes().map((call) => call.pathname)).toEqual(["/api/recurrences"]));
    expect(writes()[0]?.body).toMatchObject({ template: { name: "Corrida", projectId: "project-braid" } });
    expect([...api.store.table<RecurrenceDto>("recurrences").values()][0]?.template).toMatchObject({ projectId: "project-braid" });
  });
});

describe("edição", () => {
  it("o campo mostra o projeto da tarefa, e deixar como está não grava nada", async () => {
    install([inBraid()]);
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);

    await screen.findByRole("button", { name: FIELD_NAME("braid") });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/user-1/tarefas/ev-1"));
    expect(writes()).toEqual([]);
  });

  it("trocar o projeto manda só o projectId, com a revisão lida, e a tarefa muda de projeto", async () => {
    install([inBraid()]);
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("braid") });

    openChoice("braid");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “zeta”" }));
    save();

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: "PATCH", pathname: "/api/tasks/ev-1", body: { expectedRevision: 3, projectId: "project-zeta" } });
    expect(api.store.table<TaskDto>("tasks").get("ev-1")?.project).toEqual(ZETA);
  });

  it("voltar ao personal manda projectId null", async () => {
    install([inBraid()]);
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("braid") });

    openChoice("braid");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “personal”" }));
    save();

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({ expectedRevision: 3, projectId: null });
    expect(api.store.table<TaskDto>("tasks").get("ev-1")?.project).toEqual(FAKE_PERSONAL_PROJECT);
  });

  const WEEKLY_RULE = { frequency: "weekly", interval: 1, byWeekday: 42, timeOfDay: "18:00", timeZone: "America/Sao_Paulo", startsOn: "2026-11-03" } as const;
  const SERIES_TEMPLATE = { name: "Revisar o PR", kind: "common", priority: "medium", description: "", tags: ["pr"], projectId: "project-braid" } as const;

  function installOccurrenceInBraid() {
    install([inBraid({ recurrence: { id: "rec-1", occurrenceOn: "2026-11-14", detached: false, rule: WEEKLY_RULE } })]);
    api.store.table<RecurrenceDto>("recurrences").set("rec-1", recurrenceFixture({ id: "rec-1", ...WEEKLY_RULE, template: SERIES_TEMPLATE }));
  }

  it("trocar o projeto de uma ocorrência de série muda só a ocorrência: o PATCH da tarefa leva o projeto e a série não é tocada", async () => {
    installOccurrenceInBraid();
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("braid") });

    openChoice("braid");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “personal”" }));
    save();

    await waitFor(() => expect(writes().map((call) => `${call.method} ${call.pathname}`)).toEqual(["PATCH /api/tasks/ev-1"]));
    expect(writes()[0]?.body).toMatchObject({ projectId: null });
    expect(api.store.table<TaskDto>("tasks").get("ev-1")?.project).toEqual(FAKE_PERSONAL_PROJECT);
    expect(api.store.table<RecurrenceDto>("recurrences").get("rec-1")?.template).toEqual(SERIES_TEMPLATE);
    expect(api.store.table<RecurrenceDto>("recurrences").get("rec-1")?.revision).toBe(1);
  });

  it("trocar o projeto da ocorrência e a regra da série na mesma edição: o PATCH da série leva só a regra, sem projeto", async () => {
    installOccurrenceInBraid();
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("braid") });

    openChoice("braid");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Alfa”" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Recorrência:/ }));
    fireEvent.change(screen.getByLabelText("Repetir a cada"), { target: { value: "2" } });
    save();

    await waitFor(() => expect(writes()).toHaveLength(2));
    const task = writes().find((call) => call.pathname === "/api/tasks/ev-1");
    const series = writes().find((call) => call.pathname === "/api/recurrences/rec-1");
    expect(task?.body).toMatchObject({ projectId: ALFA.id });
    expect(series?.body).toEqual({ expectedRevision: 1, interval: 2 });
    expect(api.store.table<RecurrenceDto>("recurrences").get("rec-1")?.template).toEqual(SERIES_TEMPLATE);
  });

  it("uma série em que a pessoa voltou ao personal leva o id do personal no modelo", async () => {
    render(<TaskCreateRoute userId="user-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("personal") });
    openChoice();
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “braid”" }));
    openChoice("braid");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “personal”" }));

    setField("Título", "Corrida");
    setField("Data de início", "2026-11-16");
    setField("Hora de início", "18:30");
    fireEvent.click(screen.getByRole("button", { name: "Definir a regra" }));
    save();

    await waitFor(() => expect(writes().map((call) => call.pathname)).toEqual(["/api/recurrences"]));
    expect(writes()[0]?.body).toMatchObject({ template: { name: "Corrida", projectId: FAKE_PERSONAL_PROJECT.id } });
  });

  it("criar um projeto novo na edição também o escolhe", async () => {
    install([inBraid()]);
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("braid") });

    openChoice("braid");
    fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Buscar projeto" }), { target: { value: "novo" } });
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Criar “novo”" }));
    await waitFor(() => expect(projectField("novo")).toBeInTheDocument());
    save();

    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "PATCH" }));
    const created = [...api.store.table<ProjectDto>("projects").values()].find((project) => project.name === "novo");
    expect(api.store.table<TaskDto>("tasks").get("ev-1")?.project).toEqual(created);
  });

  it("uma revisão velha dá conflito, e o projeto escolhido fica no formulário depois da recarga", async () => {
    install([inBraid()]);
    render(<TaskEditRoute userId="user-1" taskId="ev-1" />);
    await screen.findByRole("button", { name: FIELD_NAME("braid") });
    openChoice("braid");
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “zeta”" }));
    // Outra aba editou a tarefa antes.
    const stored = api.store.table<TaskDto>("tasks").get("ev-1") as TaskDto;
    api.store.table<TaskDto>("tasks").set("ev-1", { ...stored, revision: 4 });

    save();

    expect(await screen.findByText(/mudou em outro lugar/)).toBeInTheDocument();
    expect(api.store.table<TaskDto>("tasks").get("ev-1")?.project).toEqual(BRAID);
    expect(projectField("zeta")).toBeInTheDocument();
  });
});
