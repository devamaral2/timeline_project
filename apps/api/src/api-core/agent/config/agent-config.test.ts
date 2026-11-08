import { afterEach, describe, expect, it } from "vitest";
import { AGENT_SKILLS } from "../skills/agent-skill-registry";
import { getDayContextSkill } from "../skills/get-day-context.skill";
import {
  FACTORY_AGENT_CONFIG,
  activateAgentConfig,
  agentsConfig,
  factoryAgentConfig,
  fill,
  jevRoutingConfig,
  parseAgentConfig,
  skillText,
  skillsConfig,
  withConfigSnapshot,
  type AgentConfigDocuments,
} from "./agent-config";

describe("agent config", () => {
  it("has a skills.json entry for every registered skill, and no orphans", () => {
    const registered = [...AGENT_SKILLS, getDayContextSkill].map((skill) => skill.name).sort();
    expect(Object.keys(skillsConfig).sort()).toEqual(registered);
  });

  it("routes only to skills that exist", () => {
    const registered = new Set([...AGENT_SKILLS, getDayContextSkill].map((skill) => skill.name));
    for (const spec of Object.values(agentsConfig.routes)) {
      for (const name of [...spec.readSkills, ...(Array.isArray(spec.writeSkills) ? spec.writeSkills : [])]) {
        expect(registered.has(name)).toBe(true);
      }
    }
    for (const skill of Object.values(jevRoutingConfig.targetSkills)) expect(registered.has(skill)).toBe(true);
  });

  it("keeps the read route free of write skills", () => {
    expect(agentsConfig.routes.read.writeSkills).toEqual([]);
  });

  it("rejects an unknown skill and an unfilled placeholder", () => {
    expect(() => skillText("nope")).toThrow(/skills\.json/);
    expect(() => fill("oi {{name}}", {})).toThrow(/name/);
    expect(fill("oi {{name}}", { name: "Ana" })).toBe("oi Ana");
  });
});

describe("config snapshot per request", () => {
  afterEach(() => activateAgentConfig(factoryAgentConfig()));

  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

  /** A configuracao de fabrica com uma edicao, ja validada, como o servico a ativaria. */
  function configEdited(edit: (documents: { agents: { limits: { maxSteps: number } }; skills: Record<string, { instructions: string[] }> }) => void) {
    const documents = structuredClone(FACTORY_AGENT_CONFIG) as AgentConfigDocuments;
    edit(documents as never);
    return parseAgentConfig(documents);
  }
  const withMaxSteps = (maxSteps: number) => configEdited((documents) => { documents.agents.limits.maxSteps = maxSteps; });

  it("keeps the version a request started with, across awaits, while a publish lands", async () => {
    const original = agentsConfig.limits.maxSteps;
    await withConfigSnapshot(async () => {
      activateAgentConfig(withMaxSteps(original + 5));
      await tick();
      expect(agentsConfig.limits.maxSteps).toBe(original);
    });
    expect(agentsConfig.limits.maxSteps).toBe(original + 5);
  });

  it("pins the skill texts too, not only the limits", async () => {
    const original = skillText("query_data").instructions;
    await withConfigSnapshot(async () => {
      activateAgentConfig(configEdited((documents) => { documents.skills.query_data = { ...documents.skills.query_data, instructions: ["novo"] } as never; }));
      await tick();
      expect(skillText("query_data").instructions).toBe(original);
    });
    expect(skillText("query_data").instructions).toBe("novo");
  });

  it("lets a request that starts after the publish read the new version", async () => {
    const original = agentsConfig.limits.maxSteps;
    activateAgentConfig(withMaxSteps(original + 1));
    await withConfigSnapshot(async () => {
      await tick();
      expect(agentsConfig.limits.maxSteps).toBe(original + 1);
    });
  });

  it("keeps each of two overlapping requests on the version it started with", async () => {
    const original = agentsConfig.limits.maxSteps;
    const read = async () => {
      const before = agentsConfig.limits.maxSteps;
      await tick();
      await tick();
      return [before, agentsConfig.limits.maxSteps];
    };
    const first = withConfigSnapshot(read);
    activateAgentConfig(withMaxSteps(original + 1));
    const second = withConfigSnapshot(read);
    expect(await first).toEqual([original, original]);
    expect(await second).toEqual([original + 1, original + 1]);
  });

  it("keeps the outer request's version inside a nested snapshot", async () => {
    const original = agentsConfig.limits.maxSteps;
    await withConfigSnapshot(async () => {
      activateAgentConfig(withMaxSteps(original + 1));
      await withConfigSnapshot(async () => {
        await tick();
        expect(agentsConfig.limits.maxSteps).toBe(original);
      });
    });
  });
});
