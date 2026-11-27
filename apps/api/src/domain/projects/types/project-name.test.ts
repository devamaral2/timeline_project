import { expect, test } from "vitest";
import { ProjectValidationError } from "../errors/project.errors";
import { MAX_PROJECT_NAME_LENGTH, normalizeProjectName } from "./project-name";

test("trims the ends and keeps the inside", () => {
  expect(normalizeProjectName("  timeline project \n")).toBe("timeline project");
});

test.each(["", "   ", "\t\n"])("refuses a name with nothing left: %j", (raw) => {
  expect(() => normalizeProjectName(raw)).toThrow(ProjectValidationError);
});

test("accepts exactly 60 characters and refuses 61, counted after trimming", () => {
  expect(normalizeProjectName(` ${"a".repeat(MAX_PROJECT_NAME_LENGTH)} `)).toHaveLength(MAX_PROJECT_NAME_LENGTH);
  expect(() => normalizeProjectName("a".repeat(MAX_PROJECT_NAME_LENGTH + 1))).toThrow(ProjectValidationError);
});

test("an emoji counts as one character", () => {
  expect(normalizeProjectName("🚀".repeat(MAX_PROJECT_NAME_LENGTH))).toHaveLength(MAX_PROJECT_NAME_LENGTH * 2);
  expect(() => normalizeProjectName("🚀".repeat(MAX_PROJECT_NAME_LENGTH + 1))).toThrow(ProjectValidationError);
});

test.each([undefined, null, 7, ["a"]])("refuses what is not text: %j", (raw) => {
  expect(() => normalizeProjectName(raw)).toThrow(ProjectValidationError);
});
