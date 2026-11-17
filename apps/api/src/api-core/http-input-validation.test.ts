import { BadRequestException } from "@nestjs/common";
import { describe, expect, test } from "vitest";
import { encodeAgendaCursor } from "../infrastructure/persistence/tasks/queries/agenda-cursor";
import {
  createArtifactRequestSchema,
  createTaskInputSchema,
  updateArtifactRequestSchema,
  updateTaskInputSchema,
} from "@repo/contracts/schemas";
import {
  assertAgendaCursor,
  assertArtifactRequest,
  assertTaskFields,
  assertExpectedRevision,
  assertRecurrenceTemplate,
  bodyFieldsOf,
  parseLimit,
} from "./http-input-validation";
import { normalizeSearch, parseEnum, parseEnumList, parseInstant } from "./list-filters";

describe("assertTaskFields", () => {
  const creating = (body: Record<string, unknown>) => () => assertTaskFields(body, false);
  const editing = (body: Record<string, unknown>) => () => assertTaskFields(body, true);

  test("accepts an empty body and a complete one", () => {
    expect(creating({})).not.toThrow();
    expect(
      creating({
        kind: "meal",
        status: "todo",
        priority: "urgent",
        name: "Almoço",
        notifyOffsetsMinutes: [5, 1440],
        longRunning: false,
        tags: ["a"],
        parentTaskId: "e1",
        subtaskIds: ["e2", "e3"],
        artifactIds: ["a1"],
        artifacts: [{ data: { body: "nota" } }],
        startedAt: "2026-08-17T15:00:00.000Z",
        estimatedFinishAt: "2026-08-17",
        finishedAt: "2026-08-17T16:00:00-03:00",
      }),
    ).not.toThrow();
  });

  test("only accepts the kinds and statuses of a human task", () => {
    for (const kind of ["common", "meal", "sleep", "training"]) expect(creating({ kind })).not.toThrow();
    for (const status of ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"]) {
      expect(creating({ status })).not.toThrow();
    }
    expect(creating({ kind: "request" })).toThrow("Invalid kind");
    expect(creating({ kind: "step" })).toThrow(BadRequestException);
    expect(creating({ kind: 1 })).toThrow("Invalid kind");
    expect(creating({ status: "queued" })).toThrow("Invalid status");
    expect(creating({ status: "scheduled" })).toThrow("Invalid status");
  });

  test("null clears the status only when editing", () => {
    expect(editing({ status: null })).not.toThrow();
    expect(creating({ status: null })).toThrow("Invalid status");
    expect(editing({ kind: null })).toThrow("Invalid kind");
  });

  test("null clears a date only when editing", () => {
    for (const field of ["startedAt", "estimatedFinishAt", "finishedAt"]) {
      expect(editing({ [field]: null }), field).not.toThrow();
      expect(creating({ [field]: null }), field).toThrow(`Invalid ${field}`);
      expect(editing({ [field]: "amanha" }), field).toThrow(`Invalid ${field}`);
      expect(creating({ [field]: 1755442800000 }), field).toThrow(`Invalid ${field}`);
    }
  });

  test("rejects an unknown priority", () => {
    expect(creating({ priority: "normal" })).toThrow("Invalid priority");
    expect(creating({ priority: "low" })).not.toThrow();
  });

  test("notifyOffsetsMinutes is a list of valid offsets", () => {
    expect(creating({ notifyOffsetsMinutes: [] })).not.toThrow();
    expect(creating({ notifyOffsetsMinutes: 5 })).toThrow("Invalid notifyOffsetsMinutes");
    expect(creating({ notifyOffsetsMinutes: [0] })).toThrow("Invalid notifyOffsetsMinutes");
    expect(creating({ notifyOffsetsMinutes: [5, "10"] })).toThrow("Invalid notifyOffsetsMinutes");
    expect(creating({ notifyOffsetsMinutes: [43_201] })).toThrow("Invalid notifyOffsetsMinutes");
  });

  test("longRunning is a boolean", () => {
    expect(creating({ longRunning: true })).not.toThrow();
    expect(creating({ longRunning: "true" })).toThrow("Invalid longRunning");
  });

  test("every list of ids and the tags are lists of text", () => {
    for (const field of ["tags", "subtaskIds", "artifactIds"]) {
      expect(creating({ [field]: "a" }), field).toThrow(`Invalid ${field}`);
      expect(creating({ [field]: ["a", 1] }), field).toThrow(`Invalid ${field}`);
      // Na edicao a lista de artefatos e `artifacts`; `artifactIds` so existe na criacao.
      if (field !== "artifactIds") expect(editing({ [field]: null }), field).toThrow(`Invalid ${field}`);
    }
  });

  test("parentTaskId is a task id, or null to take the task out from under its main task", () => {
    expect(creating({ parentTaskId: "p1" })).not.toThrow();
    expect(editing({ parentTaskId: null })).not.toThrow();
    expect(creating({ parentTaskId: ["p1"] })).toThrow("Invalid parentTaskId");
    expect(editing({ parentTaskId: 1 })).toThrow("Invalid parentTaskId");
  });

  test("artifacts is a list", () => {
    expect(creating({ artifacts: { data: {} } })).toThrow("Invalid artifacts");
    expect(editing({ artifacts: [] })).not.toThrow();
  });

  test("refuses any field the contract does not know, the old names included", () => {
    // Nome antigo citado de proposito: este arquivo esta na lista de excecoes da varredura de residuos.
    const velho = "event";
    const antigo = (campo: string) => campo.replace("task", velho).replace("Task", velho[0].toUpperCase() + velho.slice(1));
    for (const field of ["taskId", "previousTaskIds", "nextTaskIds", "missed", "notes"]) {
      const named = field === "missed" || field === "notes" ? field : antigo(field);
      expect(creating({ [named]: ["x"] }), named).toThrow(BadRequestException);
      expect(editing({ [named]: ["x"] }), named).toThrow(`Invalid field ${named}`);
    }
    expect(editing({ taskId: "t1", parentTaskId: null })).not.toThrow();
    // A sequencia entre tarefas saiu: os nomes dela sao campos desconhecidos.
    expect(editing({ previousTaskIds: [] })).toThrow("Invalid field previousTaskIds");
    expect(editing({ nextTaskIds: [] })).toThrow("Invalid field nextTaskIds");
  });
});

describe("assertExpectedRevision", () => {
  test("requires an integer >= 1", () => {
    expect(() => assertExpectedRevision({ expectedRevision: 1 })).not.toThrow();
    expect(() => assertExpectedRevision({ expectedRevision: 12 })).not.toThrow();
    expect(() => assertExpectedRevision({})).toThrow("Invalid expectedRevision");
    expect(() => assertExpectedRevision({ expectedRevision: 0 })).toThrow("Invalid expectedRevision");
    expect(() => assertExpectedRevision({ expectedRevision: 1.5 })).toThrow("Invalid expectedRevision");
    expect(() => assertExpectedRevision({ expectedRevision: "1" })).toThrow(BadRequestException);
    expect(() => assertExpectedRevision(undefined as never)).toThrow(BadRequestException);
  });
});

describe("assertAgendaCursor", () => {
  test("accepts a cursor the agenda issued and refuses anything else", () => {
    const cursor = encodeAgendaCursor({ startedAt: new Date("2026-08-17T15:00:00.000Z"), id: "task-1" });

    expect(() => assertAgendaCursor(cursor)).not.toThrow();
    expect(() => assertAgendaCursor("nao-e-um-cursor")).toThrow("Invalid cursor");
    expect(() => assertAgendaCursor(Buffer.from('{"startedAt":"x","id":"e"}').toString("base64url"))).toThrow(
      BadRequestException,
    );
  });
});

describe("parseLimit", () => {
  test("is optional and stays between 1 and 100", () => {
    expect(parseLimit(undefined)).toBeUndefined();
    expect(parseLimit("1")).toBe(1);
    expect(parseLimit("100")).toBe(100);
    expect(() => parseLimit("0")).toThrow("Invalid limit");
    expect(() => parseLimit("101")).toThrow("Invalid limit");
    expect(() => parseLimit("2.5")).toThrow("Invalid limit");
    expect(() => parseLimit("dez")).toThrow(BadRequestException);
  });
});

describe("assertArtifactRequest", () => {
  const creating = (body: Record<string, unknown>) => () => assertArtifactRequest(body, true);
  const editing = (body: Record<string, unknown>) => () => assertArtifactRequest(body, false);

  test("only the types the user creates and edits are accepted", () => {
    for (const type of ["text", "food", "sleep", "training"]) expect(creating({ type, data: {} }), type).not.toThrow();
    for (const type of ["workout", "skill", "agent", "router", "meal"]) {
      expect(creating({ type, data: {} }), type).toThrow("Invalid type");
      expect(editing({ type, data: {} }), type).toThrow("Invalid type");
    }
  });

  test("creating a text requires data; sleep and training may come without", () => {
    expect(creating({})).toThrow("Invalid data");
    expect(creating({ type: "text" })).toThrow("Invalid data");
    expect(creating({ data: { body: "nota" } })).not.toThrow();
    expect(creating({ type: "sleep" })).not.toThrow();
    expect(creating({ type: "training" })).not.toThrow();
  });

  test("refuses the old name of the task id list", () => {
    const antigo = "taskIds".replace("task", "event");
    expect(creating({ data: { body: "nota" }, [antigo]: [] })).toThrow(`Invalid field ${antigo}`);
    expect(editing({ [antigo]: [] })).toThrow(BadRequestException);
    expect(creating({ data: { body: "nota" }, taskIds: ["t1"] })).not.toThrow();
  });

  test("editing sends type and data together, or neither", () => {
    expect(editing({})).not.toThrow();
    expect(editing({ name: "Novo nome", tags: ["a"], taskIds: [] })).not.toThrow();
    expect(editing({ type: "text", data: { body: "novo" } })).not.toThrow();
    expect(editing({ type: "text" })).toThrow("Invalid data");
    expect(editing({ data: { body: "novo" } })).toThrow("Invalid data");
  });

  test("data is an object", () => {
    expect(creating({ data: "nota" })).toThrow("Invalid data");
    expect(creating({ data: null })).toThrow("Invalid data");
    expect(creating({ data: [] })).toThrow("Invalid data");
    expect(editing({ type: "text", data: ["x"] })).toThrow("Invalid data");
  });

  test("name is a text, tags and taskIds are lists of text", () => {
    const base = { data: { body: "nota" } };

    expect(creating({ ...base, name: 1 })).toThrow("Invalid name");
    expect(creating({ ...base, tags: "a" })).toThrow("Invalid tags");
    expect(creating({ ...base, taskIds: [1] })).toThrow("Invalid taskIds");
    expect(creating({ ...base, name: "Nota", tags: [], taskIds: ["e1"] })).not.toThrow();
  });
});

describe("assertRecurrenceTemplate", () => {
  test("must be an object, and may be absent only when not required", () => {
    expect(() => assertRecurrenceTemplate({ name: "Correr" }, true)).not.toThrow();
    expect(() => assertRecurrenceTemplate(undefined, false)).not.toThrow();
    expect(() => assertRecurrenceTemplate(undefined, true)).toThrow("Invalid template");
    expect(() => assertRecurrenceTemplate(null, false)).toThrow("Invalid template");
    expect(() => assertRecurrenceTemplate("Correr", true)).toThrow("Invalid template");
    expect(() => assertRecurrenceTemplate([], false)).toThrow(BadRequestException);
  });
});

describe("list filters", () => {
  const statuses = ["todo", "doing", "done"] as const;

  test("parseEnumList reads a comma-separated list, without repeats", () => {
    expect(parseEnumList("status", "todo, doing,todo", statuses)).toEqual(["todo", "doing"]);
    expect(parseEnumList("status", undefined, statuses)).toBeUndefined();
    expect(parseEnumList("status", "  ", statuses)).toBeUndefined();
    expect(() => parseEnumList("status", "todo,late", statuses)).toThrow('Invalid status: "late". Allowed: todo, doing, done');
  });

  test("parseEnum reads one value", () => {
    expect(parseEnum("actor", "human", ["human", "agent"])).toBe("human");
    expect(parseEnum("actor", "", ["human", "agent"])).toBeUndefined();
    expect(() => parseEnum("actor", "bot", ["human", "agent"])).toThrow(BadRequestException);
  });

  test("parseInstant reads a date and names the field it refuses", () => {
    expect(parseInstant("from", "2026-08-17T15:00:00.000Z")).toEqual(new Date("2026-08-17T15:00:00.000Z"));
    expect(parseInstant("from", "")).toBeUndefined();
    expect(parseInstant("from", undefined)).toBeUndefined();
    expect(() => parseInstant("to", "amanha")).toThrow("Invalid to date");
  });

  test("normalizeSearch trims and lowercases, and an empty search is no search", () => {
    expect(normalizeSearch("  Pagar ALUGUEL ")).toBe("pagar aluguel");
    expect(normalizeSearch("   ")).toBeUndefined();
    expect(normalizeSearch(undefined)).toBeUndefined();
  });
});

describe("the fields each body knows come from the contract schemas", () => {
  test("a schema, or a union of schemas, gives the union of its keys", () => {
    expect([...bodyFieldsOf(createArtifactRequestSchema)].sort()).toEqual(["data", "name", "tags", "taskIds", "type"]);
    expect([...bodyFieldsOf(updateArtifactRequestSchema)].sort()).toEqual([
      "data", "expectedRevision", "name", "schemaVersion", "tags", "taskIds", "type",
    ]);
    expect(bodyFieldsOf(createTaskInputSchema).has("parentTaskId")).toBe(true);
    expect(bodyFieldsOf(updateTaskInputSchema).has("expectedRevision")).toBe(true);
  });

  test("a field only an artifact variant has is accepted, one no schema has is refused", () => {
    // `schemaVersion` so existe nas variantes de edicao com `type`; `taskIds` nas duas.
    expect(() => assertArtifactRequest({ type: "text", data: { body: "x" }, schemaVersion: 2 } as never, false)).not.toThrow();
    expect(() => assertArtifactRequest({ type: "text", data: { body: "x" }, schemaVersion: 2 } as never, true)).toThrow("Invalid field schemaVersion");
    expect(() => assertArtifactRequest({ data: { body: "x" }, global: true } as never, true)).toThrow("Invalid field global");
  });

  test("the PATCH of an artifact needs nothing besides what the body carries: the id comes in the path", () => {
    expect(() => assertArtifactRequest({ name: "Novo nome" } as never, false)).not.toThrow();
    expect(() => assertArtifactRequest({ expectedRevision: 3, tags: [] } as never, false)).not.toThrow();
  });
});
