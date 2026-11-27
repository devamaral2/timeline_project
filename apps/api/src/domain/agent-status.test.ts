import { describe, expect, test } from "vitest";
import { AGENT_STATUSES, HUMAN_STATUSES, SITUATIONS } from "./sets";
import {
  FINAL_AGENT_STATUSES,
  IN_PROGRESS_AGENT_STATUSES,
  OPEN_AGENT_STATUSES,
  SUCCESS_AGENT_STATUSES,
  isFinalAgentStatus,
  isInProgressAgentStatus,
  isOpenAgentStatus,
  isSuccessAgentStatus,
  acceptsSituation,
  REVIEW_SITUATION_ON_CLOSE,
} from "./agent-status";

describe("conjunto de status de agente", () => {
  test("tem os dez status", () => {
    expect([...AGENT_STATUSES]).toEqual([
      "preparing",
      "queued",
      "starting",
      "running",
      "waiting",
      "completed",
      "interrupted",
      "failed",
      "cancelled",
      "rolled_back",
    ]);
  });

  test("nenhum status de agente e igual a um de pessoa", () => {
    const human: readonly string[] = HUMAN_STATUSES;
    expect(AGENT_STATUSES.filter((status) => human.includes(status))).toEqual([]);
  });
});

describe("grupos de status de agente", () => {
  test("guardam os valores da spec", () => {
    expect([...OPEN_AGENT_STATUSES]).toEqual(["preparing", "queued", "starting", "running", "waiting"]);
    expect([...IN_PROGRESS_AGENT_STATUSES]).toEqual(["preparing", "queued", "starting", "running"]);
    expect([...FINAL_AGENT_STATUSES]).toEqual(["completed", "interrupted", "failed", "cancelled", "rolled_back"]);
    expect([...SUCCESS_AGENT_STATUSES]).toEqual(["completed"]);
  });

  test("cada status do conjunto e aberto ou final, nunca os dois", () => {
    for (const status of AGENT_STATUSES) {
      expect(isOpenAgentStatus(status) !== isFinalAgentStatus(status)).toBe(true);
    }
  });

  test("em andamento esta dentro do aberto e sucesso dentro do final", () => {
    for (const status of AGENT_STATUSES) {
      if (isInProgressAgentStatus(status)) expect(isOpenAgentStatus(status)).toBe(true);
      if (isSuccessAgentStatus(status)) expect(isFinalAgentStatus(status)).toBe(true);
    }
  });

  test.each([
    ["preparing", { open: true, inProgress: true, final: false, success: false }],
    ["queued", { open: true, inProgress: true, final: false, success: false }],
    ["starting", { open: true, inProgress: true, final: false, success: false }],
    ["running", { open: true, inProgress: true, final: false, success: false }],
    ["waiting", { open: true, inProgress: false, final: false, success: false }],
    ["completed", { open: false, inProgress: false, final: true, success: true }],
    ["interrupted", { open: false, inProgress: false, final: true, success: false }],
    ["failed", { open: false, inProgress: false, final: true, success: false }],
    ["cancelled", { open: false, inProgress: false, final: true, success: false }],
    ["rolled_back", { open: false, inProgress: false, final: true, success: false }],
    ["done", { open: false, inProgress: false, final: false, success: false }],
    ["cancel", { open: false, inProgress: false, final: false, success: false }],
    ["todo", { open: false, inProgress: false, final: false, success: false }],
  ])("%s", (status, expected) => {
    expect({
      open: isOpenAgentStatus(status),
      inProgress: isInProgressAgentStatus(status),
      final: isFinalAgentStatus(status),
      success: isSuccessAgentStatus(status),
    }).toEqual(expected);
  });
});

describe("situacao da tarefa de agente", () => {
  test("sao tres, e o pedido que fecha nasce para revisar", () => {
    expect([...SITUATIONS]).toEqual(["to_review", "reviewed", "bookmarked"]);
    expect(REVIEW_SITUATION_ON_CLOSE).toBe("to_review");
  });

  test.each(FINAL_AGENT_STATUSES)("o pedido de agente %s aceita situacao", (status) => {
    expect(acceptsSituation({ actor: "agent", kind: "request", status })).toBe(true);
    expect(acceptsSituation({ actor: "agent", kind: "build_request", status })).toBe(true);
  });

  test.each(OPEN_AGENT_STATUSES)("a tarefa de agente %s ainda aberta nao aceita", (status) => {
    expect(acceptsSituation({ actor: "agent", kind: "request", status })).toBe(false);
  });

  test("passo, execucao agendada e tarefa de pessoa nao aceitam, mesmo num status final", () => {
    expect(acceptsSituation({ actor: "agent", kind: "step", status: "completed" })).toBe(false);
    expect(acceptsSituation({ actor: "agent", kind: "cron", status: "completed" })).toBe(false);
    expect(acceptsSituation({ actor: "human", kind: "common", status: "done" })).toBe(false);
    expect(acceptsSituation({ actor: "human", kind: "common", status: undefined })).toBe(false);
  });
});
