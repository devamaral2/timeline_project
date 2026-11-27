import { hueForTag } from "@repo/theme";
import { expect, test } from "vitest";
import { projectMarkStyle } from "./project-mark";

const hueOf = (style: object) => (style as Record<string, unknown>)["--project-hue"];

test("the hue of a project mark comes from its name through the tag hue function", () => {
  expect(hueOf(projectMarkStyle({ name: "timeline_project", personal: false }))).toBe(hueForTag("timeline_project"));
  expect(hueOf(projectMarkStyle({ name: "agent-skills", personal: false }))).toBe(hueForTag("agent-skills"));
});

test("the same name always gets the same hue, and different names can differ", () => {
  expect(projectMarkStyle({ name: "agent-skills", personal: false })).toEqual(projectMarkStyle({ name: "agent-skills", personal: false }));
  expect(hueOf(projectMarkStyle({ name: "agent-skills", personal: false }))).not.toBe(hueOf(projectMarkStyle({ name: "t3code", personal: false })));
});

test("the personal mark has no hue: the neutral colors of the CSS apply", () => {
  expect(projectMarkStyle({ name: "personal", personal: true })).toEqual({});
});
