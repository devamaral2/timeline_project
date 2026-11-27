import { expect, test } from "vitest";
import { projectInitials } from "./project-mark";

test("derives the initials from the examples of the spec", () => {
  expect(projectInitials("timeline_project")).toBe("TP");
  expect(projectInitials("agent-skills")).toBe("AS");
  expect(projectInitials("t3code")).toBe("T3");
  expect(projectInitials("personal")).toBe("PE");
});

test("splits words on space, dot, slash and the lower to upper case change", () => {
  expect(projectInitials("meu projeto")).toBe("MP");
  expect(projectInitials("api.gateway")).toBe("AG");
  expect(projectInitials("acme/web")).toBe("AW");
  expect(projectInitials("timelineProject")).toBe("TP");
  expect(projectInitials("a_b_c")).toBe("AB");
});

test("uses the first two characters of a single word and keeps a one letter name as is", () => {
  expect(projectInitials("a")).toBe("A");
  expect(projectInitials("7")).toBe("7");
  expect(projectInitials("x1")).toBe("X1");
});

test("upper cases accented initials and ignores empty words", () => {
  expect(projectInitials("ágil")).toBe("ÁG");
  expect(projectInitials("órbita_ação")).toBe("ÓA");
  expect(projectInitials("  --lead  --")).toBe("LE");
  expect(projectInitials("日本語")).toBe("日本");
});
