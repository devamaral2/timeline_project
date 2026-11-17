import { expect, test } from "vitest";
import { agendaScrollBoundaryFromAttempt } from "./agenda-scroll-boundary";

test("reveals a load boundary only when scrolling beyond that edge", () => {
  expect(agendaScrollBoundaryFromAttempt({ deltaY: -20, scrollY: 0, viewportHeight: 900, documentHeight: 1400 })).toBe("previous");
  expect(agendaScrollBoundaryFromAttempt({ deltaY: 20, scrollY: 500, viewportHeight: 900, documentHeight: 1400 })).toBe("next");

  expect(agendaScrollBoundaryFromAttempt({ deltaY: 20, scrollY: 100, viewportHeight: 900, documentHeight: 1400 })).toBeNull();
  expect(agendaScrollBoundaryFromAttempt({ deltaY: -20, scrollY: 500, viewportHeight: 900, documentHeight: 1400 })).toBeNull();
});
