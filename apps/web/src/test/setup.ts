import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// O auto-cleanup do Testing Library so roda com globals ligado; aqui é explicito.
afterEach(cleanup);
// A escolha de modelo e uma so para a pagina: cada teste comeca sem as opcoes do servidor lidas. O import e feito
// na hora, e nao no topo: aqui ele carregaria a API antes dos `vi.mock` de cada arquivo de teste.
afterEach(async () => {
  (await import("@/lib/agent-chat/model-selection-store")).resetModelSelectionStore();
});

/**
 * A partir do Node 25 existe um `localStorage` global proprio, que vale
 * `undefined` sem `--localstorage-file` e toma o lugar do que o jsdom oferece.
 * Devolvemos o do jsdom, para os testes nao dependerem da versao do Node.
 */
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
for (const name of ["localStorage", "sessionStorage"] as const) {
  if (jsdomWindow && globalThis[name] === undefined) {
    Object.defineProperty(globalThis, name, { value: jsdomWindow[name], configurable: true, writable: true });
  }
}

/**
 * jsdom nao implementa IntersectionObserver. O stub registra os alvos e expoe
 * um gatilho manual, para que os testes controlem quando o sentinel aparece.
 */
class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Dispara o callback como se todos os alvos tivessem entrado na viewport. */
  triggerIntersection(): void {
    const entries = [...this.targets].map(
      (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    );
    if (entries.length) this.callback(entries, this);
  }
}

globalThis.IntersectionObserver =
  TestIntersectionObserver as unknown as typeof IntersectionObserver;

export { TestIntersectionObserver };
