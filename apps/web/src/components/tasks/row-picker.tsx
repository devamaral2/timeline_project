"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useDismiss } from "@/components/detail/detail-parts";
import styles from "./task-glyphs.module.css";

/** Distância entre o glifo e o cartão, e a folga mínima das bordas da tela. */
const GAP = 6;
const EDGE = 16;

/**
 * O cartão das escolhas abertas pelo glifo de uma linha (status e situação): abre logo abaixo do glifo tocado,
 * alinhado à esquerda dele (acima, quando não cabe embaixo), e fecha com Esc ou toque fora. Sem glifo de âncora,
 * fica no cartão do pé da tela que o CSS define.
 */
export function RowPicker({ label, anchor, onClose, children }: {
  label: string;
  anchor?: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, ref, onClose);
  useLayoutEffect(() => {
    const picker = ref.current;
    if (!picker || !anchor) return;
    function place() {
      if (!picker || !anchor) return;
      // Sem estilo próprio o cartão volta ao pé da tela: a base dele ali é o limite que a barra inferior deixa.
      picker.removeAttribute("style");
      const foot = picker.getBoundingClientRect();
      const glyph = anchor.getBoundingClientRect();
      const below = glyph.bottom + GAP;
      const top = below + foot.height <= foot.bottom ? below : Math.max(EDGE, Math.min(glyph.top - GAP, foot.bottom) - foot.height);
      const left = Math.max(EDGE, Math.min(glyph.left, window.innerWidth - foot.width - EDGE));
      picker.style.inset = `${top}px auto auto ${left}px`;
      picker.style.margin = "0";
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  return (
    <div ref={ref} role="dialog" aria-label={label} className={styles.statusPicker}>
      {children}
    </div>
  );
}
