import { describe, expect, test } from "vitest";
import { AGENT_STATUSES } from "./sets";
import {
  FINAL_AGENT_STATUSES,
  IN_PROGRESS_AGENT_STATUSES,
  OPEN_AGENT_STATUSES,
  SUCCESS_AGENT_STATUSES,
  isFinalAgentStatus,
  isInProgressAgentStatus,
  isOpenAgentStatus,
  isSuccessAgentStatus,
} from "./agent-status";

describe("grupos de status de agente", () => {
  test("guardam os valores de hoje", () => {
    expect([...OPEN_AGENT_STATUSES]).toEqual(["queued", "running", "waiting"]);
    expect([...IN_PROGRESS_AGENT_STATUSES]).toEqual(["queued", "running"]);
    expect([...FINAL_AGENT_STATUSES]).toEqual(["done", "failed", "cancel"]);
    expect([...SUCCESS_AGENT_STATUSES]).toEqual(["done"]);
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
    ["queued", { open: true, inProgress: true, final: false, success: false }],
    ["running", { open: true, inProgress: true, final: false, success: false }],
    ["waiting", { open: true, inProgress: false, final: false, success: false }],
    ["done", { open: false, inProgress: false, final: true, success: true }],
    ["failed", { open: false, inProgress: false, final: true, success: false }],
    ["cancel", { open: false, inProgress: false, final: true, success: false }],
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
