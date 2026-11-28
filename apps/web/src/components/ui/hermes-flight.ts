import { type RefObject, useLayoutEffect } from "react";

/**
 * O voo do botão do Hermes: ao abrir o chat, tocar numa janela livre ou entrar
 * num detalhe, o círculo verde-água corre para a esquerda, encolhe, sai da
 * barra inferior e pousa como o ícone de status do campo; ao sair, volta pelo
 * mesmo caminho. Só no celular e com movimento permitido.
 */
export const FLIGHT_OUT_MS = 210;
export const FLIGHT_BACK_MS = 360;

/**
 * O caminho, em nove amostras igualmente espaçadas no tempo: quanto do desvio
 * horizontal, do vertical e do encolhimento já aconteceu. O círculo corre
 * primeiro para o lado e só depois sobe, encolhendo no meio do caminho.
 */
const PATH: ReadonlyArray<readonly [x: number, y: number, shrink: number]> = [
  [0, 0, 0],
  [0.379, 0, 0.043],
  [0.648, 0.02, 0.156],
  [0.826, 0.143, 0.316],
  [0.93, 0.338, 0.5],
  [0.981, 0.564, 0.684],
  [0.998, 0.778, 0.842],
  [1, 0.937, 0.957],
  [1, 1, 1],
];

export type Box = { left: number; top: number; width: number; height: number };

/** A caixa de um elemento na tela, ou nada se ele não está à vista. */
export function boxOf(element: Element | null | undefined): Box | null {
  if (!element) return null;
  const { left, top, width, height } = element.getBoundingClientRect();
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

/**
 * Os quadros do voo para um círculo parado sobre o botão da barra: `forward`
 * leva do botão ao ícone de status, o contrário traz de volta.
 */
export function flightKeyframes(button: Box, mark: Box, forward: boolean): Keyframe[] {
  const dx = mark.left + mark.width / 2 - (button.left + button.width / 2);
  const dy = mark.top + mark.height / 2 - (button.top + button.height / 2);
  const scale = mark.width / button.width;
  const round = (value: number) => Math.round(value * 100) / 100;
  const frames = PATH.map(([x, y, shrink]) => ({
    transform: `translate(${round(dx * x)}px, ${round(dy * y)}px) scale(${Math.round((1 + (scale - 1) * shrink) * 1000) / 1000})`,
  }));
  return forward ? frames : frames.reverse();
}

/** O voo só existe para quem não pediu menos movimento. */
export function canFly(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Um campo do Hermes fora do painel (o dos detalhes) avisa que chegou ou que saiu. */
export const hermesDockEvent = "braid:hermes-dock";
export type HermesDockDetail = { dock: HTMLElement } | { left: Box | null };

const markOf = (dock: Element) => dock.querySelector("[data-hermes-mark]");

/**
 * Liga um campo do Hermes à barra inferior: ao aparecer, o botão da barra voa
 * até o ícone de status dele; ao sair, o ícone volta para a barra. A caixa do
 * ícone é guardada enquanto o campo está na tela, porque na saída ele já não
 * pode ser medido.
 */
export function useHermesDock(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    let last = boxOf(markOf(dock));
    const remember = () => { last = boxOf(markOf(dock)) ?? last; };
    window.addEventListener("resize", remember);
    window.dispatchEvent(new CustomEvent<HermesDockDetail>(hermesDockEvent, { detail: { dock } }));
    return () => {
      window.removeEventListener("resize", remember);
      window.dispatchEvent(new CustomEvent<HermesDockDetail>(hermesDockEvent, { detail: { left: last } }));
    };
  }, [ref]);
}

/** O ícone de status de um campo do Hermes. */
export function hermesMarkIn(root: Element | null | undefined): Element | null {
  return root ? markOf(root) : null;
}
