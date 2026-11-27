import { describe, expect, test } from "vitest";
import type { AgentTaskStatus, HumanTaskStatus, TaskActor, TaskStatus } from "./task-types";
import {
  CANCELLED_AGENT_STATUSES,
  INTERRUPTED_AGENT_STATUSES,
  isInterruptedAgentStatus,
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

const AGENT_STATUSES: readonly AgentTaskStatus[] = [
  "preparing", "queued", "starting", "running", "waiting", "completed", "interrupted", "failed", "cancelled", "rolled_back",
];
const HUMAN_STATUSES: readonly HumanTaskStatus[] = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"];

describe("grupos de status de agente", () => {
  test("os grupos têm os valores da spec", () => {
    expect([...OPEN_AGENT_STATUSES]).toEqual(["preparing", "queued", "starting", "running", "waiting"]);
    expect([...IN_PROGRESS_AGENT_STATUSES]).toEqual(["preparing", "queued", "starting", "running"]);
    expect([...FINAL_AGENT_STATUSES]).toEqual(["completed", "interrupted", "failed", "cancelled", "rolled_back"]);
    expect([...SUCCESS_AGENT_STATUSES]).toEqual(["completed"]);
    expect([...CANCELLED_AGENT_STATUSES]).toEqual(["cancelled"]);
    expect([...INTERRUPTED_AGENT_STATUSES]).toEqual(["interrupted"]);
  });

  test("nenhum status de agente é igual a um de pessoa", () => {
    const human: readonly string[] = HUMAN_STATUSES;
    expect(AGENT_STATUSES.filter((status) => human.includes(status))).toEqual([]);
  });

  test("um status final não é aberto e todo status cai em aberto ou final", () => {
    for (const status of AGENT_STATUSES) expect(isOpenAgentStatus(status)).toBe(!isFinalAgentStatus(status));
  });

  test("em andamento é parte do aberto e sucesso e cancelado são partes do final", () => {
    for (const status of AGENT_STATUSES) {
      if (isInProgressAgentStatus(status)) expect(isOpenAgentStatus(status)).toBe(true);
      if (isSuccessAgentStatus(status) || isCancelledAgentStatus(status) || isInterruptedAgentStatus(status)) expect(isFinalAgentStatus(status)).toBe(true);
    }
  });
});

describe("perguntas que servem aos dois executores", () => {
  const all: ReadonlyArray<[TaskActor, TaskStatus]> = [
    ...HUMAN_STATUSES.map((status): [TaskActor, TaskStatus] => ["human", status]),
    ...AGENT_STATUSES.map((status): [TaskActor, TaskStatus] => ["agent", status]),
  ];

  test.each(all)("%s em %s: o lembrete se cala em done e cancel de pessoa e em qualquer status final de agente", (actor, status) => {
    const expected = actor === "human" ? status === "done" || status === "cancel" : FINAL_AGENT_STATUSES.includes(status as AgentTaskStatus);
    expect(endsReminders(actor, status)).toBe(expected);
  });

  test.each(all)("%s em %s: fechada é done, cancel ou missed de pessoa e o grupo final de agente", (actor, status) => {
    const expected = actor === "human" ? ["done", "cancel", "missed"].includes(status) : FINAL_AGENT_STATUSES.includes(status as AgentTaskStatus);
    expect(isClosedStatus(actor, status)).toBe(expected);
  });

  test.each(all)("%s em %s: só done de pessoa e completed de agente contam como feita na fração", (actor, status) => {
    expect(countsAsDone(actor, status)).toBe(actor === "human" ? status === "done" : status === "completed");
  });

  test("sem status nada se cala, fecha ou conta", () => {
    for (const actor of ["human", "agent"] as const) {
      expect(endsReminders(actor, undefined)).toBe(false);
      expect(isClosedStatus(actor, undefined)).toBe(false);
      expect(countsAsDone(actor, undefined)).toBe(false);
    }
  });
});
