import { act } from "@testing-library/react";

function touch(type: string, target: EventTarget, point?: { x: number; y: number }) {
  const toque = new Event(type, { bubbles: true });
  Object.defineProperty(toque, "touches", { value: point ? [{ clientX: point.x, clientY: point.y }] : [] });
  target.dispatchEvent(toque);
}

/**
 * O gesto de puxar a tela, para os testes: o dedo toca em `from` (o corpo da
 * página, se nada for dito), desce `by` px, anda `across` px para o lado e
 * solta. Com `release: false` o dedo fica na tela. A tela testada precisa do
 * `<PullToRefresh />` montado ao lado, como o shell faz.
 */
export function pullDown({ from = document.body, by = 200, across = 0, release = true }: {
  from?: Element;
  by?: number;
  across?: number;
  release?: boolean;
} = {}): void {
  act(() => {
    touch("touchstart", from, { x: 100, y: 100 });
    touch("touchmove", from, { x: 100 + across / 2, y: 100 + by / 2 });
    touch("touchmove", from, { x: 100 + across, y: 100 + by });
    if (release) touch("touchend", from);
  });
}
