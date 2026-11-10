import { expect, test, vi } from "vitest";
import { navKind, pathOf, reflow, startNavigationTransition, vtName } from "./view-transition";

test("opening a record goes in, leaving it goes back", () => {
  expect(navKind("/ana", "/ana/eventos/01EVT")).toBe("open");
  expect(navKind("/ana/tarefas", "/ana/tarefas/7")).toBe("open");
  expect(navKind("/ana/tarefas/7", "/ana/tarefas/7/editar")).toBe("open");
  expect(navKind("/ana/notas/3", "/ana/notas")).toBe("close");
  expect(navKind("/ana/eventos/01EVT", "/ana")).toBe("close");
});

test("sections move sideways in the order they are drawn", () => {
  expect(navKind("/ana", "/ana/tarefas")).toBe("next");
  expect(navKind("/ana/notas", "/ana/tarefas")).toBe("prev");
  // Na barra inferior do celular a agenda fica no meio.
  expect(navKind("/ana", "/ana/tarefas", true)).toBe("prev");
  expect(navKind("/ana", "/ana/notas", true)).toBe("next");
});

test("the logged-out preview follows the same rules", () => {
  expect(navKind("/mockups/eventos", "/mockups/eventos/notas")).toBe("next");
  expect(navKind("/mockups/eventos/tarefas", "/mockups/eventos/tarefas/1")).toBe("open");
  expect(navKind("/mockups/eventos", "/mockups/eventos/almoco")).toBe("open");
  expect(navKind("/mockups/eventos/almoco", "/mockups/eventos")).toBe("close");
});

test("a destination's path drops the query and the anchor", () => {
  expect(pathOf("/ana/tarefas?ordem=data#tarefas-done")).toBe("/ana/tarefas");
});

test("a transition name is a valid CSS identifier", () => {
  expect(vtName("task", "01J:AB/C")).toBe("task-01J_AB_C");
});

test("without the View Transitions API the change happens at once", () => {
  const navigate = vi.fn();
  startNavigationTransition("open", navigate);
  expect(navigate).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.nav).toBeUndefined();

  const update = vi.fn();
  const scope = document.createElement("div");
  reflow(scope, update);
  expect(update).toHaveBeenCalledOnce();
  expect(scope.dataset.reflow).toBeUndefined();
});
