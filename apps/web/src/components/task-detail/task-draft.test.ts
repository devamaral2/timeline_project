import type { ProjectDto, TaskArtifactDto, TaskDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { taskFixture } from "@/test/fake-api/tasks";
import { buildCreateTaskInput, buildTaskPatch, draftFromTask, emptyTaskDraft, instantFromDraft, rebaseDraft, validateTaskDraft } from "./task-draft";

describe("emptyTaskDraft e buildCreateTaskInput", () => {
  it("o rascunho vazio é uma rotina sem status, com o nome do comando", () => {
    expect(emptyTaskDraft("comprar pão")).toEqual({
      kind: "common", name: "comprar pão", status: null, priority: "medium",
      startDate: "", startTime: "", endDate: "", endTime: "", description: "", location: "", reminders: [], tags: [], longRunning: false,
      parentTaskId: null, subtaskIds: [], artifacts: [], project: null,
    });
  });

  it("lembretes e tags escolhidos na criação entram no corpo; sem escolha, não aparecem", () => {
    const chosen = buildCreateTaskInput({ ...emptyTaskDraft("Treino"), reminders: [30, 1440], tags: ["foco"] }, NOW);

    expect(chosen).toMatchObject({ notifyOffsetsMinutes: [30, 1440], tags: ["foco"] });
    expect(buildCreateTaskInput(emptyTaskDraft("Treino"), NOW)).not.toHaveProperty("notifyOffsetsMinutes");
    expect(buildCreateTaskInput(emptyTaskDraft("Treino"), NOW)).not.toHaveProperty("tags");
  });

  it("sem status e sem data, o corpo é só o que foi preenchido: a API põe agora e estima o fim", () => {
    expect(buildCreateTaskInput({ ...emptyTaskDraft(), name: "  Dentista  " }, NOW)).toEqual({
      kind: "common", name: "Dentista", description: "", priority: "medium",
    });
  });

  it("com status, data e hora, manda o status e os instantes no fuso da timeline", () => {
    const body = buildCreateTaskInput({
      ...emptyTaskDraft("Treino"), kind: "training", status: "todo", startDate: "2026-11-14", startTime: "18:30", endDate: "2026-11-14", endTime: "19:20",
    }, NOW);

    expect(body).toEqual({
      kind: "training", name: "Treino", description: "", priority: "medium", status: "todo",
      startedAt: "2026-11-14T21:30:00.000Z", estimatedFinishAt: "2026-11-14T22:20:00.000Z",
    });
  });

  it("o local só entra no corpo da criação quando foi preenchido, sem espaços nas pontas", () => {
    expect(buildCreateTaskInput(emptyTaskDraft("Dentista"), NOW)).not.toHaveProperty("location");
    expect(buildCreateTaskInput({ ...emptyTaskDraft("Dentista"), location: "  Clínica Sorriso, São Paulo " }, NOW)).toMatchObject({
      location: "Clínica Sorriso, São Paulo",
    });
  });

  it("criar já concluído manda finishedAt com o instante atual, como a troca de status", () => {
    const body = buildCreateTaskInput({ ...emptyTaskDraft("Pagar luz"), status: "done" }, NOW);

    expect(body).toMatchObject({ status: "done", finishedAt: "2026-11-14T13:00:00.000Z" });
  });
});

const BRAID: ProjectDto = { id: "project-braid", name: "braid", personal: false };

/** 10:00 em São Paulo: o relógio da edição não entra no corpo, só o instante de conclusão. */
const NOW = new Date("2026-11-14T13:00:00.000Z");

function training(overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({
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

describe("draftFromTask", () => {
  it("separa data e hora no fuso da timeline", () => {
    const draft = draftFromTask(training());

    expect(draft).toMatchObject({
      kind: "training",
      name: "Treino de força",
      status: "doing",
      priority: "medium",
      startDate: "2026-11-14",
      startTime: "18:30",
      endDate: "2026-11-14",
      endTime: "19:20",
    });
  });

  it("um início à meia-noite local é um dia sem hora", () => {
    const draft = draftFromTask(training({ startedAt: "2026-11-15T00:00:00-03:00" }));

    expect(draft).toMatchObject({ startDate: "2026-11-15", startTime: "" });
  });

  it("lê a tarefa principal e as subtarefas", () => {
    const draft = draftFromTask(training({ parentTaskId: "ev-2", subtaskIds: ["ev-3", "ev-4"] }));

    expect(draft).toMatchObject({ parentTaskId: "ev-2", subtaskIds: ["ev-3", "ev-4"] });
  });

  it("sem tarefa principal, o rascunho guarda null", () => {
    expect(draftFromTask(training()).parentTaskId).toBeNull();
  });

  it("uma tarefa de referência sem data e sem status tem os campos vazios e o status nulo", () => {
    const draft = draftFromTask(training({ status: undefined, startedAt: undefined, estimatedFinishAt: undefined }));

    expect(draft).toMatchObject({ status: null, startDate: "", startTime: "", endDate: "", endTime: "" });
  });
});

describe("instantFromDraft", () => {
  it("um dia sem hora é a meia-noite local", () => {
    expect(instantFromDraft("2026-11-15", "")).toBe("2026-11-15T03:00:00.000Z");
  });

  it("dia e hora são o instante no fuso da timeline", () => {
    expect(instantFromDraft("2026-11-14", "19:00")).toBe("2026-11-14T22:00:00.000Z");
  });

  it("sem data não há instante", () => {
    expect(instantFromDraft("", "")).toBeNull();
  });
});

describe("buildTaskPatch", () => {
  it("sem nenhuma mudança não há o que enviar", () => {
    const task = training();

    expect(buildTaskPatch(task, draftFromTask(task), NOW)).toBeNull();
  });

  it("manda só os campos que mudaram, com a revisão lida", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), name: "Treino de peito", priority: "urgent" }, NOW)).toEqual({
      expectedRevision: 3,
      name: "Treino de peito",
      priority: "urgent",
    });
  });

  it("troca o tipo e a descrição", () => {
    const task = training({ description: "" });

    expect(buildTaskPatch(task, { ...draftFromTask(task), kind: "meal", description: "Frango e arroz" }, NOW)).toEqual({
      expectedRevision: 3,
      kind: "meal",
      description: "Frango e arroz",
    });
  });

  it("espaços nas pontas do título não contam como mudança", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), name: "  Treino de força " }, NOW)).toBeNull();
  });

  it("concluir envia finishedAt com o instante atual", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), status: "done" }, NOW)).toEqual({
      expectedRevision: 3,
      status: "done",
      finishedAt: "2026-11-14T13:00:00.000Z",
    });
  });

  it("tirar de feito envia finishedAt nulo", () => {
    const task = training({ status: "done", finishedAt: "2026-11-14T12:00:00.000Z" });

    expect(buildTaskPatch(task, { ...draftFromTask(task), status: "inHold" }, NOW)).toEqual({
      expectedRevision: 3,
      status: "inHold",
      finishedAt: null,
    });
  });

  it("sem status manda status nulo", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), status: null }, NOW)).toEqual({ expectedRevision: 3, status: null });
  });

  it("apagar a data remove o início", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), startDate: "", startTime: "" }, NOW)).toEqual({
      expectedRevision: 3,
      startedAt: null,
    });
  });

  it("uma data sem hora grava o início à meia-noite local", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), startDate: "2026-11-15", startTime: "" }, NOW)).toEqual({
      expectedRevision: 3,
      startedAt: "2026-11-15T03:00:00.000Z",
    });
  });

  it("ligar a tarefa persistente manda longRunning verdadeiro", () => {
    const task = training();

    expect(buildTaskPatch(task, { ...draftFromTask(task), longRunning: true }, NOW)).toEqual({
      expectedRevision: 3,
      longRunning: true,
    });
  });

  it("desligar a tarefa persistente manda longRunning falso", () => {
    const task = training({ longRunning: true });

    expect(buildTaskPatch(task, { ...draftFromTask(task), longRunning: false }, NOW)).toEqual({
      expectedRevision: 3,
      longRunning: false,
    });
  });

  it("não reenvia um horário que já está gravado, mesmo com segundos", () => {
    const task = training({ startedAt: "2026-11-14T18:30:15-03:00" });

    expect(buildTaskPatch(task, draftFromTask(task), NOW)).toBeNull();
  });

  it("hierarquia: manda a tarefa principal e a lista completa de subtarefas, e só o que mudou", () => {
    const task = training({ parentTaskId: "ev-2", subtaskIds: [] });

    expect(buildTaskPatch(task, { ...draftFromTask(task), parentTaskId: "ev-3", subtaskIds: ["ev-4"] }, NOW)).toEqual({
      expectedRevision: 3,
      parentTaskId: "ev-3",
      subtaskIds: ["ev-4"],
    });
    expect(buildTaskPatch(task, { ...draftFromTask(task), subtaskIds: ["ev-4"] }, NOW)).toEqual({
      expectedRevision: 3,
      subtaskIds: ["ev-4"],
    });
    expect(buildTaskPatch(task, draftFromTask(task), NOW)).toBeNull();
  });

  it("tirar a tarefa principal manda parentTaskId null", () => {
    const task = training({ parentTaskId: "ev-2" });

    expect(buildTaskPatch(task, { ...draftFromTask(task), parentTaskId: null }, NOW)).toEqual({
      expectedRevision: 3,
      parentTaskId: null,
    });
  });
});

describe("validateTaskDraft", () => {
  it("o título não pode ficar vazio", () => {
    const task = training();

    expect(validateTaskDraft({ ...draftFromTask(task), name: "   " })).toEqual({ name: "Dê um título à tarefa." });
  });

  it("uma hora sem data é recusada no campo da hora", () => {
    const task = training();

    expect(validateTaskDraft({ ...draftFromTask(task), startDate: "", startTime: "18:30" })).toMatchObject({
      startTime: "Informe a data para marcar a hora.",
    });
  });

  it("o término não pode ser antes do início", () => {
    const task = training();

    expect(validateTaskDraft({ ...draftFromTask(task), endTime: "18:00" })).toEqual({
      endDate: "O término não pode ser antes do início.",
    });
  });

  it("tarefa longa: o prazo pode vir antes do início, porque o início é o real", () => {
    const task = training({ longRunning: true });

    expect(validateTaskDraft({ ...draftFromTask(task), endDate: "2026-11-10", endTime: "" })).toEqual({});
  });

  it("tarefa longa sem status, ou como não realizado, é recusado no status", () => {
    const task = training({ longRunning: true });

    expect(validateTaskDraft({ ...draftFromTask(task), status: null })).toHaveProperty("status");
    expect(validateTaskDraft({ ...draftFromTask(task), status: "missed" })).toHaveProperty("status");
    expect(validateTaskDraft({ ...draftFromTask(task), status: "todo" })).toEqual({});
  });

  it("tarefa longa sem prazo não pode ter lembrete", () => {
    const task = training({ longRunning: true });
    const noDeadline = { ...draftFromTask(task), endDate: "", endTime: "", reminders: [30] };

    expect(validateTaskDraft(noDeadline)).toEqual({
      reminders: "Tarefa persistente sem previsão de entrega não tem lembrete.",
    });
    expect(validateTaskDraft({ ...noDeadline, reminders: [] })).toEqual({});
    expect(validateTaskDraft({ ...draftFromTask(task), reminders: [30] })).toEqual({});
  });

  it("sem ser longo, um bloco de mais de 31 dias é recusado e sugere a tarefa persistente", () => {
    const task = training();

    expect(validateTaskDraft({ ...draftFromTask(task), endDate: "2026-12-15", endTime: "19:20" })).toEqual({
      endDate: "Um bloco não dura mais de 31 dias. Para algo que segue por mais tempo, marque como tarefa persistente.",
    });
  });

  it("sem ser longo, um bloco de exatos 31 dias é aceito", () => {
    const task = training();

    expect(validateTaskDraft({ ...draftFromTask(task), endDate: "2026-12-15", endTime: "18:30" })).toEqual({});
  });

  it("uma entrada válida não tem erro", () => {
    const task = training();

    expect(validateTaskDraft(draftFromTask(task))).toEqual({});
  });
});

describe("lembretes e tags", () => {
  it("o rascunho lê os lembretes em ordem crescente e as tags como estão", () => {
    const draft = draftFromTask(training({ notifyOffsetsMinutes: [1440, 30], tags: ["saúde", "pessoal"] }));

    expect(draft).toMatchObject({ reminders: [30, 1440], tags: ["saúde", "pessoal"] });
  });

  it("lembretes e tags trocados entram no corpo, com o conjunto inteiro", () => {
    const task = training({ notifyOffsetsMinutes: [30], tags: ["saúde"] });
    const draft = { ...draftFromTask(task), reminders: [30, 1440], tags: ["saúde", "foco"] };

    expect(buildTaskPatch(task, draft, NOW)).toEqual({
      expectedRevision: 3,
      notifyOffsetsMinutes: [30, 1440],
      tags: ["saúde", "foco"],
    });
  });

  it("uma lista com os mesmos valores, mesmo vinda de outra leitura, não é mudança", () => {
    const task = training({ notifyOffsetsMinutes: [1440, 30], tags: ["foco"] });

    expect(buildTaskPatch(task, draftFromTask(task), NOW)).toBeNull();
  });

  it("uma tag removida manda a lista sem ela, e a lista vazia vai como vazia", () => {
    const task = training({ tags: ["foco"], notifyOffsetsMinutes: [30] });

    expect(buildTaskPatch(task, { ...draftFromTask(task), tags: [], reminders: [] }, NOW)).toEqual({
      expectedRevision: 3,
      notifyOffsetsMinutes: [],
      tags: [],
    });
  });

  it("a lista que a pessoa não mexeu acompanha a versão nova na releitura", () => {
    const before = training({ tags: ["foco"], notifyOffsetsMinutes: [30] });
    const after = training({ revision: 4, tags: ["foco", "pessoal"], notifyOffsetsMinutes: [30, 1440] });
    const typed = { ...draftFromTask(before), name: "Meu título" };

    expect(rebaseDraft(typed, before, after)).toMatchObject({
      name: "Meu título",
      tags: ["foco", "pessoal"],
      reminders: [30, 1440],
    });
  });

  it("a lista que a pessoa mexeu fica como ela deixou", () => {
    const before = training({ tags: ["foco"] });
    const after = training({ revision: 4, tags: ["pessoal"] });
    const typed = { ...draftFromTask(before), tags: ["foco", "casa"] };

    expect(rebaseDraft(typed, before, after)).toMatchObject({ tags: ["foco", "casa"] });
  });
});

describe("artefatos na edição", () => {
  /** Um vínculo como a tarefa o devolve: o artefato inteiro (catálogo global é treino; o próprio, nota). */
  function link(id: string, name: string, relation: TaskArtifactDto["relation"] = "uses") {
    const global = id === "art-gym";
    return {
      relation,
      fromRecurrence: false,
      artifact: {
        id, name, global, derived: false, schemaVersion: 1, tags: [], revision: 1,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
        ...(global
          ? { type: "workout", data: { code: "weightlifting", category: "strength", active: true } }
          : { type: "text", data: { body: "" } }),
      } as TaskArtifactDto["artifact"],
    };
  }
  const workout = link("art-gym", "Musculação");
  const sheet = link("art-sheet", "Ficha A");

  it("o rascunho lê a lista de artefatos da tarefa, na ordem da API", () => {
    const draft = draftFromTask(training({ artifacts: [workout, sheet] }));

    expect(draft.artifacts).toEqual([
      { id: "art-gym", name: "Musculação", type: "workout", global: true, relation: "uses" },
      { id: "art-sheet", name: "Ficha A", type: "text", global: false, relation: "uses" },
    ]);
  });

  it("a lista mudada vai no PATCH inteira, com id e relação de cada um, na ordem da tela", () => {
    const task = training({ artifacts: [workout, sheet] });
    const base = draftFromTask(task);
    const reordered = { ...base, artifacts: [...base.artifacts].reverse() };

    expect(buildTaskPatch(task, reordered, NOW)).toEqual({
      expectedRevision: 3,
      artifacts: [
        { id: "art-sheet", relation: "uses" },
        { id: "art-gym", relation: "uses" },
      ],
    });
  });

  it("uma lista sem mudança não entra no PATCH", () => {
    const task = training({ artifacts: [workout, sheet] });

    expect(buildTaskPatch(task, draftFromTask(task), NOW)).toBeNull();
  });

  it("quem a tarefa criou segue na lista com a relação creates", () => {
    const created = link("art-sheet", "Ficha A", "creates");
    const task = training({ artifacts: [created] });
    const kept = draftFromTask(task);

    expect(buildTaskPatch(task, { ...kept, name: "Treino novo" }, NOW)).toEqual({
      expectedRevision: 3,
      name: "Treino novo",
    });
    expect(buildTaskPatch(task, { ...kept, artifacts: [] }, NOW)).toEqual({ expectedRevision: 3, artifacts: [] });
  });

  it("na releitura, a lista que a pessoa não mexeu acompanha a versão nova, e a que mexeu fica", () => {
    const before = training({ artifacts: [workout] });
    const after = training({ revision: 4, artifacts: [workout, sheet] });
    const untouched = rebaseDraft(draftFromTask(before), before, after);
    const touched = rebaseDraft({ ...draftFromTask(before), artifacts: [] }, before, after);

    expect(untouched.artifacts.map((item) => item.id)).toEqual(["art-gym", "art-sheet"]);
    expect(touched.artifacts).toEqual([]);
  });
});

describe("rebaseDraft", () => {
  it("o campo que a pessoa não mexeu acompanha a versão nova, e o que ela digitou fica", () => {
    const before = training();
    const after = training({ revision: 4, priority: "high", name: "Outro nome" });
    const typed = { ...draftFromTask(before), name: "Meu título" };

    expect(rebaseDraft(typed, before, after)).toMatchObject({ name: "Meu título", priority: "high" });
  });
});

describe("projeto", () => {
  it("a edição começa no projeto que a tarefa tem", () => {
    expect(draftFromTask(training({ project: BRAID })).project).toEqual(BRAID);
    expect(draftFromTask(training()).project).toMatchObject({ personal: true, name: "personal" });
  });

  it("a criação só manda projectId quando a pessoa escolheu um projeto que não é o personal", () => {
    expect(buildCreateTaskInput({ ...emptyTaskDraft("Treino"), project: BRAID }, NOW)).toMatchObject({ projectId: "project-braid" });
    expect(buildCreateTaskInput(emptyTaskDraft("Treino"), NOW)).not.toHaveProperty("projectId");
    const personal: ProjectDto = { id: "project-personal", name: "personal", personal: true };
    expect(buildCreateTaskInput({ ...emptyTaskDraft("Treino"), project: personal }, NOW)).not.toHaveProperty("projectId");
  });

  it("trocar de projeto manda o id, voltar ao personal manda null e deixar como está não manda nada", () => {
    const inBraid = training({ project: BRAID });
    const personal: ProjectDto = { id: "project-personal", name: "personal", personal: true };
    const other: ProjectDto = { id: "project-other", name: "outro", personal: false };

    expect(buildTaskPatch(inBraid, { ...draftFromTask(inBraid), project: other }, NOW)).toEqual({ expectedRevision: 3, projectId: "project-other" });
    expect(buildTaskPatch(inBraid, { ...draftFromTask(inBraid), project: personal }, NOW)).toEqual({ expectedRevision: 3, projectId: null });
    expect(buildTaskPatch(inBraid, draftFromTask(inBraid), NOW)).toBeNull();
    expect(buildTaskPatch(training(), { ...draftFromTask(training()), project: BRAID }, NOW)).toEqual({ expectedRevision: 3, projectId: "project-braid" });
  });

  it("o projeto que a pessoa não mexeu acompanha a versão nova, e o que ela escolheu fica", () => {
    const before = training();
    const movedElsewhere = training({ revision: 4, project: BRAID });

    expect(rebaseDraft(draftFromTask(before), before, movedElsewhere).project).toEqual(BRAID);
    expect(rebaseDraft({ ...draftFromTask(before), project: { id: "p9", name: "escolhido", personal: false } }, before, movedElsewhere).project).toMatchObject({ id: "p9" });
  });
});
