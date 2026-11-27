import { render, screen } from "@testing-library/react";
import { hueForTag } from "@repo/theme";
import { expect, test } from "vitest";
import { ProjectLine, ProjectMark } from "./project-line";

const personal = { id: "p1", name: "diario", personal: true };
const named = { id: "p2", name: "timeline_project", personal: false };

test("the project line shows the mark with the initials and the name of the project", () => {
  render(<ProjectLine project={named} />);

  expect(screen.getByText("timeline_project")).toBeInTheDocument();
  expect(screen.getByText("TP")).toBeInTheDocument();
});

test("the line also shows the personal project, with its initial", () => {
  render(<ProjectLine project={personal} />);

  expect(screen.getByText("diario")).toBeInTheDocument();
  expect(screen.getByText("D")).toBeInTheDocument();
});

test("the color of a project comes from its name through the tag hue function, and the same name gets the same color", () => {
  const { container, rerender } = render(<ProjectMark project={named} />);
  const first = container.querySelector<HTMLElement>("[data-project-mark]");
  expect(first?.style.getPropertyValue("--project-hue")).toBe(String(hueForTag("timeline_project")));

  rerender(<ProjectMark project={{ ...named, id: "outro-id" }} />);
  expect(container.querySelector<HTMLElement>("[data-project-mark]")?.style.getPropertyValue("--project-hue")).toBe(
    String(hueForTag("timeline_project")),
  );
});

test("the default project is neutral: it has no hue of its own", () => {
  const { container } = render(<ProjectMark project={personal} />);
  const mark = container.querySelector<HTMLElement>("[data-project-mark]");

  expect(mark).toHaveAttribute("data-personal", "true");
  expect(mark).toHaveTextContent("D");
  expect(mark?.style.getPropertyValue("--project-hue")).toBe("");
});

test("the mark beside the name is decorative, and a lone mark takes the project name as its accessible name", () => {
  const { container, rerender } = render(<ProjectLine project={named} />);
  expect(container.querySelector("[data-project-mark]")).toHaveAttribute("aria-hidden", "true");

  rerender(<ProjectMark project={named} labelled />);
  expect(screen.getByRole("img", { name: "timeline_project" })).toHaveTextContent("TP");
});
