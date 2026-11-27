"use client";

import { type RefObject, useLayoutEffect } from "react";

/**
 * O quanto a gaveta de execução cobre do pé da tela, em px, como variável CSS na raiz do documento. O que fica fixo
 * no pé da tela (a escolha de status da lista) sobe esse tanto e nunca fica por baixo da gaveta. Sem gaveta à
 * vista a variável não existe, e o CSS cai no valor de sempre (`--fixed-bottom-offset`, em globals.css, lê `var(--execution-clearance, 0px)`).
 */
export const EXECUTION_CLEARANCE_VAR = "--execution-clearance";

/** Da borda de cima da gaveta até o pé da janela; zero quando ela não ocupa lugar (escondida). */
export function clearanceOf(box: { top: number; height: number }, viewportHeight: number): number {
  if (box.height <= 0) return 0;
  return Math.max(0, Math.round(viewportHeight - box.top));
}

/**
 * Publica a altura coberta pela gaveta enquanto `visible`, e a acompanha enquanto ela cresce, encolhe ou a janela
 * muda. Ao sair de vista (ou desmontar) a variável é removida.
 */
export function useExecutionClearance(ref: RefObject<HTMLElement | null>, visible: boolean): void {
  useLayoutEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (!visible || !element) return;
    function publish() {
      if (!element) return;
      root.style.setProperty(EXECUTION_CLEARANCE_VAR, `${clearanceOf(element.getBoundingClientRect(), window.innerHeight)}px`);
    }
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(EXECUTION_CLEARANCE_VAR);
    };
  }, [ref, visible]);
}
