import { describe, expect, test } from "vitest";
import { AGENT_STATUSES, HUMAN_STATUSES } from "./sets";
import {
  FINAL_AGENT_STATUSES,
  IN_PROGRESS_AGENT_STATUSES,
  OPEN_AGENT_STATUSES,
  SUCCESS_AGENT_STATUSES,
  TURN_AGENT_STATUSES,
  agentStatusesBefore,
  canTransitionAgentStatus,
  isFinalAgentStatus,
  isInProgressAgentStatus,
  isOpenAgentStatus,
  isSuccessAgentStatus,
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

describe("transicoes de status de agente", () => {
  test.each([
    ["preparing", ["queued", "running", "failed", "cancelled"]],
    ["queued", ["starting", "running", "failed", "cancelled"]],
    ["starting", ["running", "failed", "cancelled"]],
    ["running", ["waiting", "completed", "failed", "interrupted"]],
    ["waiting", ["running", "failed", "cancelled"]],
    ["completed", ["rolled_back"]],
    ["interrupted", ["rolled_back"]],
    ["failed", ["rolled_back"]],
    ["cancelled", []],
    ["rolled_back", []],
  ] as const)("de %s aceita so %j", (from, accepted) => {
    const allowed = AGENT_STATUSES.filter((to) => canTransitionAgentStatus(from, to));
    expect(allowed).toEqual(AGENT_STATUSES.filter((to) => (accepted as readonly string[]).includes(to)));
  });

  test("um status final so segue para rolled_back, e cancelado nunca reabre", () => {
    for (const from of FINAL_AGENT_STATUSES) {
      for (const to of AGENT_STATUSES) {
        if (to !== "rolled_back") expect(canTransitionAgentStatus(from, to)).toBe(false);
      }
    }
  });

  test("agentStatusesBefore lista de onde se chega a um status", () => {
    expect(agentStatusesBefore("running")).toEqual(["preparing", "queued", "starting", "waiting"]);
    expect(agentStatusesBefore("completed")).toEqual(["running"]);
    expect(agentStatusesBefore("interrupted")).toEqual(["running"]);
    expect(agentStatusesBefore("cancelled")).toEqual(["preparing", "queued", "starting", "waiting"]);
    expect(agentStatusesBefore("failed")).toEqual(["preparing", "queued", "starting", "running", "waiting"]);
    expect(agentStatusesBefore("preparing")).toEqual([]);
  });

  test("o worker do turno aceita queued, starting e running", () => {
    expect([...TURN_AGENT_STATUSES]).toEqual(["queued", "starting", "running"]);
  });
});
