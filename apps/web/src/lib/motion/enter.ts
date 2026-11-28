import { motionAllowed } from "./view-transition";
import { motionMs } from "@repo/theme";

/** A curva de entrada do globals.css (`--ease-out`), para as animações feitas por código. */
const EASE_OUT = "cubic-bezier(.2, .8, .2, 1)";

/**
 * Faz um bloco entrar deslizando de um lado: `direction` 1 vem da direita (o
 * dia seguinte), -1 da esquerda (o anterior).
 */
export function slideIn(element: Element | null | undefined, direction: 1 | -1, distance = 32) {
  if (!element || typeof element.animate !== "function" || !motionAllowed()) return;
  element.animate(
    [{ opacity: 0, transform: `translateX(${direction * distance}px)` }, { opacity: 1, transform: "none" }],
    { duration: motionMs(300), easing: EASE_OUT },
  );
}

/** O valor de um campo que acabou de mudar entra por baixo. */
export function riseIn(element: Element | null | undefined, distance = 10) {
  if (!element || typeof element.animate !== "function" || !motionAllowed()) return;
  element.animate(
    [{ opacity: 0, transform: `translateY(${distance}px)` }, { opacity: 1, transform: "none" }],
    { duration: motionMs(280), easing: EASE_OUT },
  );
}
