import { expect, test } from "vitest";
import { darkTheme, hueForTag, lightTheme } from "./theme";
import { projectInitials, projectMarkColors } from "./project-mark";

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

test("a colored mark takes its hue from the tag hue function and the tag lightness and chroma of the theme", () => {
  const mark = projectMarkColors({ name: "timeline_project", personal: false }, lightTheme);
  expect(mark.personal).toBe(false);
  expect(mark.hue).toBe(hueForTag("timeline_project"));
  expect(mark.lightness).toBe(lightTheme.tag.lightness);
  expect(mark.chroma).toBe(lightTheme.tag.chroma);
  expect(mark.text).toBe(lightTheme.colors.background);

  const dark = projectMarkColors({ name: "timeline_project", personal: false }, darkTheme);
  expect(dark.hue).toBe(mark.hue);
  expect(dark.lightness).toBe(darkTheme.tag.lightness);
  expect(dark.text).toBe(darkTheme.colors.background);
});

test("the same name always gets the same color, and personal has none", () => {
  const a = projectMarkColors({ name: "agent-skills", personal: false }, lightTheme);
  expect(projectMarkColors({ name: "agent-skills", personal: false }, lightTheme)).toEqual(a);
  expect(projectMarkColors({ name: "t3code", personal: false }, lightTheme).hue).not.toBe(a.hue);

  const personal = projectMarkColors({ name: "personal", personal: true }, lightTheme);
  expect(personal).toEqual({
    personal: true,
    background: lightTheme.colors.muted,
    text: lightTheme.colors.mutedForeground,
    outline: lightTheme.colors.border,
  });
});
