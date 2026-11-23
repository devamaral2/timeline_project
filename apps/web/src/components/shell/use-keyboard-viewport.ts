import { type RefObject, useEffect } from "react";

/** Abaixo disso a diferença é a barra de endereço que encolhe, não o teclado. */
const KEYBOARD_MIN_PX = 100;

/**
 * Prende o painel à parte visível da tela enquanto o teclado está aberto.
 *
 * No celular o navegador não encolhe o layout quando o teclado sobe (o padrão
 * do Chrome Android e do Safari é só encolher a viewport visual), e o painel,
 * fixo com `inset: 0`, deixaria o campo do chat atrás do teclado. Aqui a
 * `visualViewport` vira duas variáveis no elemento — `--vv-top` (quanto a vista
 * desceu) e `--vv-bottom` (quanto o teclado cobre) — e `data-keyboard` marca
 * quando o teclado está aberto; o CSS (`shell.module.css`) usa as três.
 */
export function useKeyboardViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = ref.current;
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !element || !viewport) return;
    // O navegador já entrega `resize`/`scroll` da viewport no máximo uma vez por quadro.
    function apply() {
      if (!element || !viewport) return;
      const top = Math.max(0, viewport.offsetTop);
      const bottom = Math.max(0, window.innerHeight - viewport.height - top);
      const open = bottom >= KEYBOARD_MIN_PX;
      element.style.setProperty("--vv-top", `${open ? top : 0}px`);
      element.style.setProperty("--vv-bottom", `${open ? bottom : 0}px`);
      element.toggleAttribute("data-keyboard", open);
    }
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      element.style.removeProperty("--vv-top");
      element.style.removeProperty("--vv-bottom");
      element.removeAttribute("data-keyboard");
    };
  }, [ref, active]);
}
