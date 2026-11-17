import { describe, expect, test } from "vitest";
import { MAX_ARTIFACT_LINKS, type ArtifactLink } from "../types/artifact-link";
import { TaskValidationError } from "../errors/task.errors";
import { Task, MAX_TASK_BLOCK_DAYS, type TaskCreateProps, type TaskRehydrateProps } from "./task.entity";

const startedAt = new Date("2026-08-31T12:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function props(overrides: Partial<TaskCreateProps> = {}): TaskCreateProps {
  return { userId: "user-1", name: "Planejamento", startedAt, ...overrides };
}

const createdAt = new Date("2026-08-30T09:00:00.000Z");
const updatedAt = new Date("2026-08-30T10:00:00.000Z");

function stored(overrides: Partial<TaskRehydrateProps> = {}): TaskRehydrateProps {
  return {
    id: "task-1", userId: "user-1", actor: "human", kind: "common", name: "Planejamento", startedAt, revision: 3,
    createdAt, updatedAt, ...overrides,
  };
}

const link = (artifactId: string, overrides: Partial<ArtifactLink> = {}): ArtifactLink => ({
  artifactId,
  relation: "uses",
  fromRecurrence: false,
  ...overrides,
});

describe("Task.create", () => {
  test("creates a human routine with revision 1, medium priority and normalized tags", () => {
    const task = Task.create(props({ tags: [" Trabalho ", "trabalho", ""] }));

    expect(task.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(task.actor).toBe("human");
    expect(task.kind).toBe("common");
    expect(task.priority).toBe("medium");
    expect(task.description).toBe("");
    expect(task.revision).toBe(1);
    expect(task.tags).toEqual(["trabalho"]);
    expect(task.longRunning).toBe(false);
    expect(task.data).toEqual({});
    expect(task.artifactLinks).toEqual([]);
    expect(task.parentId).toBeUndefined();
    expect(task.subtaskIds).toEqual([]);
    expect(task.occurrence).toBeUndefined();
  });

  test("a new task never starts in a hierarchy: the hierarchy is not a field of the task", () => {
    const task = Task.create(props({ parentId: "p1", subtaskIds: ["s1"] } as never));

    expect(task.parentId).toBeUndefined();
    expect(task.subtaskIds).toEqual([]);
  });

  describe("reference task (no status)", () => {
    test("is a reference task and requires a start", () => {
      expect(Task.create(props()).isReference).toBe(true);
      expect(() => Task.create(props({ startedAt: undefined }))).toThrow("A reference task requires startedAt");
    });

    test("gets the typical duration of its kind when no planned finish was given", () => {
      const minutes = (kind: "common" | "meal" | "sleep" | "training") => {
        const task = Task.create(props({ kind }));
        return ((task.estimatedFinishAt as Date).getTime() - startedAt.getTime()) / MINUTE;
      };

      expect(minutes("common")).toBe(60);
      expect(minutes("meal")).toBe(20);
      expect(minutes("sleep")).toBe(7 * 60);
      expect(minutes("training")).toBe(90);
    });

    test("keeps the planned finish that was given", () => {
      const estimatedFinishAt = new Date(startedAt.getTime() + 15 * MINUTE);

      expect(Task.create(props({ estimatedFinishAt })).estimatedFinishAt).toEqual(estimatedFinishAt);
    });

    test("is born with the default 5-minute notification, unless told otherwise", () => {
      expect(Task.create(props()).notifyOffsetsMinutes).toEqual([5]);
      expect(Task.create(props({ notifyOffsetsMinutes: [] })).notifyOffsetsMinutes).toEqual([]);
      expect(Task.create(props({ notifyOffsetsMinutes: [30, 1440] })).notifyOffsetsMinutes).toEqual([30, 1440]);
    });

    test("never records an actual finish by default", () => {
      expect(Task.create(props()).finishedAt).toBeUndefined();
    });
  });

  describe("tracked task (with status)", () => {
    test("is not a reference task and may have no dates at all", () => {
      const task = Task.create(props({ status: "toDefine", startedAt: undefined }));

      expect(task.isReference).toBe(false);
      expect(task.status).toBe("toDefine");
      expect(task.startedAt).toBeUndefined();
      expect(task.estimatedFinishAt).toBeUndefined();
      expect(task.finishedAt).toBeUndefined();
    });

    test("gets neither a default duration nor a default notification", () => {
      const task = Task.create(props({ status: "todo" }));

      expect(task.startedAt).toEqual(startedAt);
      expect(task.estimatedFinishAt).toBeUndefined();
      expect(task.notifyOffsetsMinutes).toEqual([]);
    });

    test("may have only a planned finish, as a deadline", () => {
      const deadline = new Date("2026-09-05T12:00:00.000Z");
      const task = Task.create(props({ status: "todo", startedAt: undefined, estimatedFinishAt: deadline }));

      expect(task.estimatedFinishAt).toEqual(deadline);
    });

    test("accepts being concluded before its planned start", () => {
      const finishedAt = new Date(startedAt.getTime() - DAY);

      expect(Task.create(props({ status: "done", finishedAt })).finishedAt).toEqual(finishedAt);
    });
  });

  describe("kinds and statuses per actor", () => {
    test("a human task accepts every human kind and status", () => {
      for (const kind of ["common", "meal", "sleep", "training"] as const) {
        expect(Task.create(props({ kind })).kind).toBe(kind);
      }
      for (const status of ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const) {
        expect(Task.create(props({ status })).status).toBe(status);
      }
    });

    test("a human task rejects the kinds and statuses of an agent", () => {
      expect(() => Task.create(props({ kind: "request" }))).toThrow("Invalid kind for a human task: request");
      expect(() => Task.create(props({ kind: "step", status: "todo" }))).toThrow(TaskValidationError);
      expect(() => Task.create(props({ status: "queued" }))).toThrow("Invalid status for a human task: queued");
      expect(() => Task.create(props({ status: "failed" }))).toThrow(TaskValidationError);
    });

    test("a agent task accepts every agent kind and status, with or without dates", () => {
      const kinds = ["request", "search_request", "build_request", "inquiry_request", "review_request", "cron", "step"] as const;
      for (const kind of kinds) {
        expect(Task.create(props({ actor: "agent", kind, status: "queued", startedAt: undefined })).kind).toBe(kind);
      }
      for (const status of ["queued", "running", "waiting", "done", "failed", "cancel"] as const) {
        expect(Task.create(props({ actor: "agent", kind: "request", status })).status).toBe(status);
      }
    });

    test("a agent task always has a status, and only an agent one", () => {
      expect(() => Task.create(props({ actor: "agent", kind: "request" }))).toThrow(
        "A agent task always has one of the agent statuses",
      );
      expect(() => Task.create(props({ actor: "agent", kind: "request", status: "todo" }))).toThrow(TaskValidationError);
      expect(() => Task.create(props({ actor: "agent", kind: "request", status: "missed" }))).toThrow(TaskValidationError);
    });

    test("a agent task rejects the human kinds, including the default one", () => {
      expect(() => Task.create(props({ actor: "agent", status: "queued" }))).toThrow(
        "Invalid kind for a agent task: common",
      );
      expect(() => Task.create(props({ actor: "agent", kind: "meal", status: "queued" }))).toThrow(TaskValidationError);
    });

    test("a agent task gets no default notification", () => {
      expect(Task.create(props({ actor: "agent", kind: "request", status: "queued" })).notifyOffsetsMinutes).toEqual([]);
    });
  });

  describe("long-running task", () => {
    test("is born todo when no status was given, and needs no dates", () => {
      const task = Task.create(props({ longRunning: true, startedAt: undefined }));

      expect(task.longRunning).toBe(true);
      expect(task.status).toBe("todo");
      expect(task.isReference).toBe(false);
      expect(task.estimatedFinishAt).toBeUndefined();
      expect(task.notifyOffsetsMinutes).toEqual([]);
    });

    test("keeps the status that was given", () => {
      expect(Task.create(props({ longRunning: true, status: "doing" })).status).toBe("doing");
    });

    test("is never missed", () => {
      expect(() => Task.create(props({ longRunning: true, status: "missed" }))).toThrow(
        "A long-running task is never missed",
      );
    });

    test("does not repeat", () => {
      const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-31", detached: false };

      expect(() => Task.create(props({ longRunning: true, occurrence }))).toThrow("A long-running task does not repeat");
    });

    test("only a human task can be long-running", () => {
      expect(() => Task.create(props({ actor: "agent", kind: "request", status: "queued", longRunning: true }))).toThrow(
        "Only a human task can be long-running",
      );
    });

    test("has no notifications without a deadline, and accepts them with one", () => {
      expect(() => Task.create(props({ longRunning: true, notifyOffsetsMinutes: [60] }))).toThrow(
        "A long-running task without a deadline has no notifications",
      );

      const deadline = new Date(startedAt.getTime() + 90 * DAY);
      const task = Task.create(props({ longRunning: true, estimatedFinishAt: deadline, notifyOffsetsMinutes: [60] }));
      expect(task.notifyOffsetsMinutes).toEqual([60]);
    });

    test("may last more than the 31-day cap and may start after its deadline", () => {
      const longer = Task.create(
        props({ longRunning: true, estimatedFinishAt: new Date(startedAt.getTime() + 400 * DAY) }),
      );
      const late = Task.create(props({ longRunning: true, estimatedFinishAt: new Date(startedAt.getTime() - DAY) }));

      expect(longer.longRunning).toBe(true);
      expect(late.estimatedFinishAt?.getTime()).toBeLessThan(startedAt.getTime());
    });
  });

  describe("planned window outside long-running tasks", () => {
    test("rejects a planned finish before the start, and accepts one equal to it", () => {
      expect(() => Task.create(props({ estimatedFinishAt: new Date(startedAt.getTime() - 1) }))).toThrow(
        "estimatedFinishAt must be equal to or after startedAt",
      );
      expect(Task.create(props({ estimatedFinishAt: startedAt })).estimatedFinishAt).toEqual(startedAt);
    });

    test(`caps the block at ${MAX_TASK_BLOCK_DAYS} days, for reference and tracked tasks alike`, () => {
      const atTheCap = new Date(startedAt.getTime() + MAX_TASK_BLOCK_DAYS * DAY);
      const beyond = new Date(atTheCap.getTime() + 1);

      expect(Task.create(props({ estimatedFinishAt: atTheCap })).estimatedFinishAt).toEqual(atTheCap);
      expect(() => Task.create(props({ estimatedFinishAt: beyond }))).toThrow(
        "A task longer than 31 days must be long-running",
      );
      expect(() => Task.create(props({ status: "todo", estimatedFinishAt: beyond }))).toThrow(TaskValidationError);
    });
  });

  describe("relations", () => {
    test("keeps the artifact links in order, with their relation and origin", () => {
      const task = Task.create(
        props({ artifactLinks: [link("a2", { relation: "creates" }), link("a1", { fromRecurrence: true })] }),
      );

      expect(task.artifactLinks).toEqual([
        { artifactId: "a2", relation: "creates", fromRecurrence: false },
        { artifactId: "a1", relation: "uses", fromRecurrence: true },
      ]);
    });

    test("rejects two links to the same artifact", () => {
      expect(() => Task.create(props({ artifactLinks: [link("a1"), link("a1", { relation: "updates" })] }))).toThrow(
        "Duplicate artifact link: a1",
      );
    });

    test("rejects more artifact links than the position column holds", () => {
      const links = Array.from({ length: MAX_ARTIFACT_LINKS + 1 }, (_, index) => link(`a${index}`));

      expect(() => Task.create(props({ artifactLinks: links }))).toThrow(
        `A task accepts at most ${MAX_ARTIFACT_LINKS} artifacts`,
      );
    });

    test("rejects a task that is its own main task or subtask", () => {
      expect(() => Task.rehydrate(stored({ id: "task-1", parentId: "task-1" }))).toThrow(
        "A task cannot be its own subtask",
      );
      expect(() => Task.rehydrate(stored({ id: "task-1", subtaskIds: ["task-1"] }))).toThrow("A task cannot be its own subtask");
    });
  });

  describe("field validation", () => {
    test("rejects an unknown priority", () => {
      expect(() => Task.create(props({ priority: "normal" as never }))).toThrow("Invalid task priority: normal");
    });

    test("rejects a notification offset out of bounds and removes repeated ones", () => {
      expect(() => Task.create(props({ notifyOffsetsMinutes: [0] }))).toThrow("Invalid notification offset");
      expect(() => Task.create(props({ notifyOffsetsMinutes: [5.5] }))).toThrow("Invalid notification offset");
      expect(() => Task.create(props({ notifyOffsetsMinutes: [43_201] }))).toThrow("Invalid notification offset");
      expect(Task.create(props({ notifyOffsetsMinutes: [10, 10, 60] })).notifyOffsetsMinutes).toEqual([10, 60]);
    });

    test("rejects data that is not an object", () => {
      expect(() => Task.create(props({ data: [] as never }))).toThrow("Task data must be an object");
      expect(() => Task.create(props({ data: "resumo" as never }))).toThrow("Task data must be an object");
      expect(Task.create(props({ data: { summary: "ok" } })).data).toEqual({ summary: "ok" });
    });
  });
});

describe("Task.rehydrate", () => {
  test("returns the row as it was stored, without the defaults of a new task", () => {
    const task = Task.rehydrate(stored());

    expect(task.isReference).toBe(true);
    expect(task.estimatedFinishAt).toBeUndefined();
    expect(task.notifyOffsetsMinutes).toEqual([]);
    expect(task.revision).toBe(3);
  });

  test("does not give a stored long-running task a status it never had", () => {
    expect(() => Task.rehydrate(stored({ longRunning: true }))).toThrow("A long-running task always has a status");
  });

  test("reads the hierarchy, without repeated subtasks: its main task and its subtasks", () => {
    const task = Task.rehydrate(stored({ parentId: "p1", subtaskIds: ["s1", "s1", "s2"] }));

    expect(task.parentId).toBe("p1");
    expect(task.subtaskIds).toEqual(["s1", "s2"]);
  });

  test("a stored task outside any hierarchy has no main task and no subtasks", () => {
    const task = Task.rehydrate(stored());

    expect(task.parentId).toBeUndefined();
    expect(task.subtaskIds).toEqual([]);
  });

  test("still enforces the invariants on what comes from storage", () => {
    expect(() => Task.rehydrate(stored({ startedAt: undefined }))).toThrow("A reference task requires startedAt");
    expect(() => Task.rehydrate(stored({ actor: "agent", kind: "step" }))).toThrow(TaskValidationError);
  });

  test("rejects a revision that is not an integer >= 1", () => {
    expect(() => Task.rehydrate(stored({ revision: 0 }))).toThrow("Task revision must be an integer >= 1");
    expect(() => Task.rehydrate(stored({ revision: 1.5 }))).toThrow(TaskValidationError);
  });
});

describe("Task.revise", () => {
  test("bumps the revision and keeps the identity and what was not changed", () => {
    const task = Task.create(props({ kind: "training", tags: ["gym"], priority: "high", data: { source: "voice" } }));

    const revised = task.revise({ name: "Treino de perna" });

    expect(revised.revision).toBe(2);
    expect(revised.id).toBe(task.id);
    expect(revised.userId).toBe("user-1");
    expect(revised.name).toBe("Treino de perna");
    expect(revised.kind).toBe("training");
    expect(revised.priority).toBe("high");
    expect(revised.tags).toEqual(["gym"]);
    expect(revised.data).toEqual({ source: "voice" });
    expect(revised.startedAt).toEqual(startedAt);
    expect(revised.estimatedFinishAt).toEqual(task.estimatedFinishAt);
    expect(revised.notifyOffsetsMinutes).toEqual([5]);
    expect(task.revision).toBe(1);
    expect(task.name).toBe("Planejamento");
  });

  test("changes every editable field", () => {
    const estimatedFinishAt = new Date(startedAt.getTime() + 2 * 60 * MINUTE);
    const finishedAt = new Date(startedAt.getTime() + 90 * MINUTE);

    const revised = Task.create(props()).revise({
      kind: "meal",
      status: "done",
      priority: "urgent",
      description: "com a equipe",
      estimatedFinishAt,
      finishedAt,
      notifyOffsetsMinutes: [15],
      tags: ["Time"],
      artifactLinks: [link("a1")],
    });

    expect(revised).toMatchObject({
      kind: "meal",
      status: "done",
      priority: "urgent",
      description: "com a equipe",
      estimatedFinishAt,
      finishedAt,
      notifyOffsetsMinutes: [15],
      tags: ["time"],
      artifactLinks: [link("a1")],
      parentId: undefined,
      subtaskIds: [],
    });
  });

  test("null clears the status and the task goes back to being a reference one", () => {
    const tracked = Task.create(props({ status: "doing" }));

    const revised = tracked.revise({ status: null });

    expect(revised.status).toBeUndefined();
    expect(revised.isReference).toBe(true);
  });

  test("null cannot clear the status of a task without a start", () => {
    const undated = Task.create(props({ status: "todo", startedAt: undefined }));

    expect(() => undated.revise({ status: null })).toThrow("A reference task requires startedAt");
  });

  test("null clears the dates of a tracked task", () => {
    const tracked = Task.create(
      props({
        status: "done",
        estimatedFinishAt: new Date(startedAt.getTime() + 60 * MINUTE),
        finishedAt: new Date(startedAt.getTime() + 50 * MINUTE),
      }),
    );

    const revised = tracked.revise({ startedAt: null, estimatedFinishAt: null, finishedAt: null });

    expect(revised.startedAt).toBeUndefined();
    expect(revised.estimatedFinishAt).toBeUndefined();
    expect(revised.finishedAt).toBeUndefined();
  });

  test("null cannot clear the start of a reference task", () => {
    expect(() => Task.create(props()).revise({ startedAt: null })).toThrow("A reference task requires startedAt");
  });

  test("clearing the planned finish does not bring the default duration back", () => {
    expect(Task.create(props()).revise({ estimatedFinishAt: null }).estimatedFinishAt).toBeUndefined();
  });

  test("undefined keeps the status and the dates", () => {
    const tracked = Task.create(props({ status: "doing", finishedAt: startedAt }));

    const revised = tracked.revise({ status: undefined, startedAt: undefined, finishedAt: undefined });

    expect(revised.status).toBe("doing");
    expect(revised.startedAt).toEqual(startedAt);
    expect(revised.finishedAt).toEqual(startedAt);
  });

  test("replaces the whole list of artifact links, and an empty list empties it", () => {
    const task = Task.create(props({ artifactLinks: [link("a1"), link("a2")] }));

    expect(task.revise({ artifactLinks: [link("a2")] }).artifactLinks).toEqual([link("a2")]);
    expect(task.revise({ artifactLinks: [] }).artifactLinks).toEqual([]);
  });

  test("keeps the hierarchy as it was read: revising never changes it", () => {
    const task = Task.rehydrate(stored({ parentId: "p1", subtaskIds: ["s1"] }));

    const revised = task.revise({ name: "Outro nome", parentId: "x", subtaskIds: [] } as never);

    expect(revised.parentId).toBe("p1");
    expect(revised.subtaskIds).toEqual(["s1"]);
  });

  test("detaches the occurrence from its series, whatever was edited", () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-31", detached: false };
    const task = Task.create(props({ occurrence }));

    expect(task.revise({ description: "editada" }).occurrence).toEqual({ ...occurrence, detached: true });
    expect(task.revise({ name: "Outro" }).occurrence?.detached).toBe(true);
    expect(task.occurrence?.detached).toBe(false);
  });

  test("a task that is not an occurrence stays without a series", () => {
    expect(Task.create(props()).revise({ name: "Outro" }).occurrence).toBeUndefined();
  });

  test("a agent task cannot be revised", () => {
    const request = Task.create(props({ actor: "agent", kind: "request", status: "queued" }));

    expect(() => request.revise({ name: "Outro" })).toThrow("A agent task cannot be edited");
  });

  test("applies the same invariants as a new task", () => {
    const task = Task.create(props());

    expect(() => task.revise({ status: "queued" as never })).toThrow("Invalid status for a human task: queued");
    expect(() => task.revise({ kind: "step" })).toThrow(TaskValidationError);
    expect(() => task.revise({ estimatedFinishAt: new Date(startedAt.getTime() - 1) })).toThrow(TaskValidationError);
    expect(() => task.revise({ artifactLinks: [link("a1"), link("a1")] })).toThrow("Duplicate artifact link: a1");
  });

  test("turning a task into a long-running one requires a status and no notification without deadline", () => {
    const reference = Task.create(props());
    const tracked = Task.create(props({ status: "todo" }));

    expect(() => reference.revise({ longRunning: true })).toThrow("A long-running task always has a status");
    expect(() => reference.revise({ longRunning: true, status: "todo", estimatedFinishAt: null })).toThrow(
      "A long-running task without a deadline has no notifications",
    );
    expect(tracked.revise({ longRunning: true }).longRunning).toBe(true);
    expect(() => tracked.revise({ longRunning: true, status: "missed" })).toThrow("A long-running task is never missed");
  });

  test("an occurrence cannot become long-running", () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-31", detached: false };
    const task = Task.create(props({ status: "todo", occurrence }));

    expect(() => task.revise({ longRunning: true })).toThrow("A long-running task does not repeat");
  });
});

describe("Task location", () => {
  test("is absent until someone informs it, is trimmed, and is kept by rehydrate", () => {
    expect(Task.create(props()).location).toBeUndefined();
    expect(Task.create(props({ location: "   " })).location).toBeUndefined();
    expect(Task.create(props({ location: "  Parque Ibirapuera, São Paulo " })).location).toBe("Parque Ibirapuera, São Paulo");
    expect(Task.rehydrate(stored({ location: "Casa" })).location).toBe("Casa");
    expect(Task.rehydrate(stored()).location).toBeUndefined();
  });

  test("revise changes it, clears it with null or an empty text, and keeps it when absent", () => {
    const task = Task.create(props({ location: "Casa" }));
    expect(task.revise({ location: "Escritório" }).location).toBe("Escritório");
    expect(task.revise({ location: "" }).location).toBeUndefined();
    expect(task.revise({ location: null }).location).toBeUndefined();
    expect(task.revise({ name: "Outro" }).location).toBe("Casa");
  });

  test("refuses a location longer than 300 characters and one on a agent task", () => {
    expect(() => Task.create(props({ location: "a".repeat(301) }))).toThrow(TaskValidationError);
    expect(() => Task.rehydrate(stored({ actor: "agent", kind: "request", status: "running", location: "Casa" }))).toThrow(
      TaskValidationError,
    );
  });
});

describe("Task timestamps", () => {
  test("a new task is created and updated at the same instant", () => {
    const now = new Date("2026-08-31T08:00:00.000Z");
    const task = Task.create(props({ now }));
    expect(task.createdAt).toEqual(now);
    expect(task.updatedAt).toEqual(now);
  });

  test("rehydrate keeps both as stored", () => {
    const task = Task.rehydrate(stored());
    expect(task.createdAt).toEqual(createdAt);
    expect(task.updatedAt).toEqual(updatedAt);
  });

  test("revise moves updatedAt and keeps createdAt", () => {
    const later = new Date("2026-08-31T15:00:00.000Z");
    const revised = Task.rehydrate(stored()).revise({ name: "Outro" }, later);
    expect(revised.createdAt).toEqual(createdAt);
    expect(revised.updatedAt).toEqual(later);
  });

  test("a clock behind the creation never puts updatedAt before createdAt", () => {
    const revised = Task.rehydrate(stored()).revise({ name: "Outro" }, new Date("2026-01-01T00:00:00.000Z"));
    expect(revised.updatedAt).toEqual(createdAt);
  });

  test("refuses a stored task updated before it was created", () => {
    expect(() => Task.rehydrate(stored({ updatedAt: new Date("2026-08-29T00:00:00.000Z") }))).toThrow(TaskValidationError);
  });
});
