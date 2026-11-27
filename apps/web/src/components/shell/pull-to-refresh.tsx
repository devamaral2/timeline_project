"use client";

import { useEffect, useRef, useState } from "react";
import { currentPullRefresh, PULL_REST, PULL_THRESHOLD, pullTravel } from "@/lib/navigation/pull-refresh";
import styles from "./pull-to-refresh.module.css";

type Phase = "idle" | "pulling" | "refreshing";

/** O dedo precisa andar isto antes de o gesto escolher um sentido. */
const SLOP_PX = 8;
/** O indicador gira ao menos isto, para uma leitura rápida não virar um piscar. */
const MIN_SPIN_MS = 450;
/** Uma releitura que nunca termina não prende o indicador na tela. */
const REFRESH_TIMEOUT_MS = 20_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * O toque só vira puxão quando começa no que rola com a página. Painel fixo
 * (a barra inferior, o chat, uma folha, um diálogo) e lista com rolagem
 * própria ficam de fora: lá, arrastar para baixo já quer dizer outra coisa.
 */
function startsOnPage(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  for (let element: Element | null = target; element && element !== document.body && element !== document.documentElement; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.position === "fixed") return false;
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && element.scrollHeight > element.clientHeight) return false;
  }
  return true;
}

/**
 * Puxar para recarregar, no toque: com a página no topo, arrastar para baixo
 * traz o indicador; soltar depois do limite chama a releitura que a tela
 * publicou (`usePullRefresh`) e o indicador gira até ela terminar. Tela sem
 * releitura publicada não mostra nada. Enquanto o shell está montado, o gesto
 * do navegador (que recarregaria a página inteira) fica desligado pelo
 * `data-pull-refresh` do `<html>`, lido no `globals.css`.
 */
export function PullToRefresh() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [armed, setArmed] = useState(false);
  const indicator = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.pullRefresh = "";
    return () => {
      delete root.dataset.pullRefresh;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let origin: { x: number; y: number } | null = null;
    let pulling = false;
    let travel = 0;
    let ready = false;
    let busy = false;

    // A posição acompanha o dedo fora do React: um desenho por toque seria caro.
    function move(next: number) {
      travel = next;
      const element = indicator.current;
      if (element) {
        element.style.setProperty("--pull", `${next}px`);
        element.style.setProperty("--pull-arc", String(Math.round(Math.min(1, next / PULL_THRESHOLD) * 75)));
      }
      // O arco acende quando soltar já vale; só essa virada passa pelo React.
      if (ready !== next >= PULL_THRESHOLD) {
        ready = next >= PULL_THRESHOLD;
        setArmed(ready);
      }
    }

    function settle() {
      origin = null;
      pulling = false;
      move(0);
      setPhase("idle");
    }

    async function refresh() {
      const run = currentPullRefresh();
      if (!run) {
        settle();
        return;
      }
      busy = true;
      origin = null;
      pulling = false;
      move(PULL_REST);
      setPhase("refreshing");
      const started = Date.now();
      try {
        await Promise.race([run(), wait(REFRESH_TIMEOUT_MS)]);
      } catch {
        // A tela avisa a própria falha; aqui o indicador só recolhe.
      }
      const remaining = MIN_SPIN_MS - (Date.now() - started);
      if (remaining > 0) await wait(remaining);
      busy = false;
      if (mounted) settle();
    }

    function onTouchStart(event: TouchEvent) {
      if (busy) return;
      // Um segundo dedo desfaz o puxão que estava em curso.
      if (origin) settle();
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) return;
      if (!currentPullRefresh() || window.scrollY > 0 || !startsOnPage(event.target)) return;
      origin = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchMove(event: TouchEvent) {
      if (!origin) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch || window.scrollY > 0) {
        settle();
        return;
      }
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (!pulling) {
        if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
        // Para o lado é o carrossel de dias; para cima é a rolagem da página.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          origin = null;
          return;
        }
        pulling = true;
        setPhase("pulling");
      }
      move(pullTravel(dy));
    }

    function onTouchEnd() {
      if (!origin) return;
      if (pulling && travel >= PULL_THRESHOLD) void refresh();
      else settle();
    }

    function onTouchCancel() {
      if (origin) settle();
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      mounted = false;
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  return (
    <div ref={indicator} className={styles.indicator} data-phase={phase} data-armed={armed ? "" : undefined}>
      <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden="true">
        <circle className={styles.track} cx="12" cy="12" r="8" />
        <circle className={styles.arc} cx="12" cy="12" r="8" pathLength="100" />
      </svg>
      <span role="status" className="sr-only">{phase === "refreshing" ? "Atualizando…" : ""}</span>
    </div>
  );
}
