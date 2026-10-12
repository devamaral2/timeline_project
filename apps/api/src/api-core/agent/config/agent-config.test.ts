import { describe, expect, it } from "vitest";
import { AGENT_SKILLS } from "../skills/agent-skill-registry";
import { getDayContextSkill } from "../skills/get-day-context.skill";
import { agentsConfig, fill, jevRoutingConfig, skillsConfig, skillText } from "./agent-config";

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
