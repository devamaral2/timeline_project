import { describe, expect, test } from "vitest";
import type { AgentTaskStatus, HumanTaskStatus, TaskActor, TaskStatus } from "./task-types";
import {
  CANCELLED_AGENT_STATUSES,
  FINAL_AGENT_STATUSES,
  IN_PROGRESS_AGENT_STATUSES,
  OPEN_AGENT_STATUSES,
  SUCCESS_AGENT_STATUSES,
  countsAsDone,
  endsReminders,
  isCancelledAgentStatus,
  isClosedStatus,
  isFinalAgentStatus,
  isInProgressAgentStatus,
  isOpenAgentStatus,
  isSuccessAgentStatus,
} from "./agent-status-groups";

const AGENT_STATUSES: readonly AgentTaskStatus[] = ["queued", "running", "waiting", "done", "failed", "cancel"];
const HUMAN_STATUSES: readonly HumanTaskStatus[] = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"];

describe("grupos de status de agente", () => {
  test("os grupos têm os valores de hoje", () => {
    expect([...OPEN_AGENT_STATUSES]).toEqual(["queued", "running", "waiting"]);
    expect([...IN_PROGRESS_AGENT_STATUSES]).toEqual(["queued", "running"]);
    expect([...FINAL_AGENT_STATUSES]).toEqual(["done", "failed", "cancel"]);
    expect([...SUCCESS_AGENT_STATUSES]).toEqual(["done"]);
    expect([...CANCELLED_AGENT_STATUSES]).toEqual(["cancel"]);
  });

  test("um status final não é aberto e todo status cai em aberto ou final", () => {
    for (const status of AGENT_STATUSES) expect(isOpenAgentStatus(status)).toBe(!isFinalAgentStatus(status));
  });

  test("em andamento é parte do aberto e sucesso e cancelado são partes do final", () => {
    for (const status of AGENT_STATUSES) {
      if (isInProgressAgentStatus(status)) expect(isOpenAgentStatus(status)).toBe(true);
      if (isSuccessAgentStatus(status) || isCancelledAgentStatus(status)) expect(isFinalAgentStatus(status)).toBe(true);
    }
  });
});

describe("perguntas que servem aos dois executores", () => {
  const all: ReadonlyArray<[TaskActor, TaskStatus]> = [
    ...HUMAN_STATUSES.map((status): [TaskActor, TaskStatus] => ["human", status]),
    ...AGENT_STATUSES.map((status): [TaskActor, TaskStatus] => ["agent", status]),
  ];

  test.each(all)("%s em %s: o lembrete se cala só em done e cancel", (actor, status) => {
    expect(endsReminders(actor, status)).toBe(status === "done" || status === "cancel");
  });

  test.each(all)("%s em %s: fechada é done, cancel, missed ou failed", (actor, status) => {
    expect(isClosedStatus(actor, status)).toBe(["done", "cancel", "missed", "failed"].includes(status));
  });

  test.each(all)("%s em %s: só done conta como feita na fração", (actor, status) => {
    expect(countsAsDone(actor, status)).toBe(status === "done");
  });

  test("sem status nada se cala, fecha ou conta", () => {
    for (const actor of ["human", "agent"] as const) {
      expect(endsReminders(actor, undefined)).toBe(false);
      expect(isClosedStatus(actor, undefined)).toBe(false);
      expect(countsAsDone(actor, undefined)).toBe(false);
    }
  });
});
