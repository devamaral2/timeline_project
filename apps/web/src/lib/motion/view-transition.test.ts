import { expect, test, vi } from "vitest";
import { navKind, pathOf, reflow, startNavigationTransition, vtName } from "./view-transition";

test("opening a record goes in, leaving it goes back", () => {
  expect(navKind("/ana", "/ana/tarefas/01EVT")).toBe("open");
  expect(navKind("/ana/tarefas", "/ana/tarefas/7")).toBe("open");
  expect(navKind("/ana/tarefas/7", "/ana/tarefas/7/editar")).toBe("open");
  expect(navKind("/ana/notas/3", "/ana/notas")).toBe("close");
  expect(navKind("/ana/tarefas/01EVT", "/ana")).toBe("close");
});

test("sections move sideways in the order they are drawn", () => {
  expect(navKind("/ana", "/ana/tarefas")).toBe("next");
  expect(navKind("/ana/notas", "/ana/tarefas")).toBe("prev");
  // Na barra inferior do celular a agenda fica no meio.
  expect(navKind("/ana", "/ana/tarefas", true)).toBe("prev");
  expect(navKind("/ana", "/ana/notas", true)).toBe("next");
});

test("the logged-out preview follows the same rules", () => {
  expect(navKind("/mockups/tarefas", "/mockups/tarefas/notas")).toBe("next");
  expect(navKind("/mockups/tarefas/tarefas", "/mockups/tarefas/tarefas/1")).toBe("open");
  expect(navKind("/mockups/tarefas", "/mockups/tarefas/almoco")).toBe("open");
  expect(navKind("/mockups/tarefas/almoco", "/mockups/tarefas")).toBe("close");
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

test("in a hidden tab the change happens at once, with no transition for the browser to abort", () => {
  const startViewTransition = vi.fn();
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  try {
    const navigate = vi.fn();
    startNavigationTransition("open", navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.nav).toBeUndefined();

    const update = vi.fn();
    const scope = document.createElement("div");
    reflow(scope, update);
    expect(update).toHaveBeenCalledOnce();
    expect(scope.dataset.reflow).toBeUndefined();
    expect(startViewTransition).not.toHaveBeenCalled();
  } finally {
    visibility.mockRestore();
    Reflect.deleteProperty(document, "startViewTransition");
  }
});

test("a transition the browser aborts leaves no unhandled rejection", async () => {
  const ready = Promise.reject(new DOMException("Transition was aborted because of invalid state", "InvalidStateError"));
  const handled = vi.spyOn(ready, "catch");
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      update();
      return { ready, finished: Promise.resolve() };
    },
  });
  const motion = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  try {
    const update = vi.fn();
    reflow(document.createElement("div"), update);
    expect(update).toHaveBeenCalledOnce();
    expect(handled).toHaveBeenCalledOnce();
    await ready.catch(() => {});
  } finally {
    motion.mockRestore();
    Reflect.deleteProperty(document, "startViewTransition");
  }
});
