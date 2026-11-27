import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { NoteSheet } from "./NoteSheet";

/** A página da frente e a borda da página de trás: dois caminhos no primeiro svg. */
function strokesOf(container: HTMLElement): number {
  return container.querySelectorAll("span > svg:first-child > path").length;
}

function glyphOf(container: HTMLElement): Element | null {
  return container.querySelector("span > svg:nth-child(2)");
}

test("a structured note carries the glyph of its type inside the front page of the stack", () => {
  const { container } = render(<NoteSheet type="meal" />);
  const sheet = container.querySelector("span");

  expect(sheet?.getAttribute("data-note-type")).toBe("meal");
  expect(sheet?.getAttribute("data-size")).toBe("list");
  expect(strokesOf(container)).toBe(2);
  expect(glyphOf(container)?.getAttribute("class")).toContain("lucide-plate");
});

test("a text note has no type icon, so it carries the letter A in its place", () => {
  const { container } = render(<NoteSheet type="text" />);

  expect(strokesOf(container)).toBe(2);
  expect(glyphOf(container)?.getAttribute("data-glyph")).toBe("letter");
});

test("a type this frontend does not know falls back to the text sheet", () => {
  const { container } = render(<NoteSheet type="something-new" size="cite" />);

  expect(container.querySelector("span")?.getAttribute("data-size")).toBe("cite");
  expect(glyphOf(container)?.getAttribute("data-glyph")).toBe("letter");
});

test("the sheet is decoration: the row around it already names the note", () => {
  const { container } = render(<NoteSheet type="agent" />);

  expect(container.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
});

test("an exercise has its own glyph, not the training one", () => {
  const { container } = render(<NoteSheet type="workout" />);

  expect(glyphOf(container)?.getAttribute("class")).toContain("lucide-movement");
});

test("a router carries the compass", () => {
  const { container } = render(<NoteSheet type="router" />);

  expect(glyphOf(container)?.getAttribute("class")).toContain("lucide-compass");
});
