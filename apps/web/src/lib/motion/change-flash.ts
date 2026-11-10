import { type RefObject, useEffect, useRef } from "react";
import { riseIn } from "./enter";

/** Por quanto tempo, depois de uma edição do Hermes, um valor que muda se anuncia. */
const ARMED_MS = 4000;
/** Quanto o fio fica sob o valor novo antes de apagar (o tempo do `sweep` no CSS). */
const FLASH_MS = 1600;

let armedUntil = 0;

/**
 * O Hermes acabou de editar o registro: os valores que mudarem na recarga que
 * vem a seguir entram por baixo, com um fio verde-água que passa e apaga. Fora
 * dessa janela nada pisca — um relógio que anda ou uma edição da própria pessoa
 * trocam de valor em silêncio.
 */
export function armChangeFlash() {
  armedUntil = Date.now() + ARMED_MS;
}

/**
 * Liga um elemento ao aviso de mudança: compara o texto dele a cada render e,
 * dentro da janela aberta por `armChangeFlash`, marca `data-changed` (o CSS de
 * quem usa desenha o fio).
 */
export function useChangeFlash<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  const text = useRef<string | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Sem dependências de propósito: o valor é qualquer coisa que o pai desenhe.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const next = element.textContent ?? "";
    const previous = text.current;
    text.current = next;
    if (previous === null || previous === next || Date.now() > armedUntil) return;
    riseIn(element);
    element.dataset.changed = "true";
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { delete element.dataset.changed; }, FLASH_MS);
  });

  return ref;
}
