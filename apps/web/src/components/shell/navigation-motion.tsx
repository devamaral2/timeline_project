"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { canTransition, isPhone, navigationSettled, navKind, pathOf, startNavigationTransition } from "@/lib/motion/view-transition";

/** Rotas que não são telas do app: quem responde é o servidor. */
const SERVER_PATH = /^\/(api|auth)\//;

/**
 * Liga as trocas de tela ao movimento: todo link interno clicado navega dentro
 * de uma transição, com o sentido tirado do caminho (para dentro de um
 * registro, de volta, ou para o lado entre as seções). Quando a rota nova
 * aparece, a transição é solta.
 */
export function NavigationMotion() {
  const router = useRouter();
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: a rota nova é o sinal.
  useEffect(() => {
    navigationSettled();
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!canTransition() || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || anchor.dataset.noMotion !== undefined) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname || SERVER_PATH.test(url.pathname)) return;
      event.preventDefault();
      const kind = navKind(window.location.pathname, url.pathname, isPhone());
      startNavigationTransition(kind, () => router.push(`${url.pathname}${url.search}${url.hash}`), anchor.closest("li") ?? anchor);
    }
    // Na captura: antes do `Link`, que desiste da navegação ao ver o clique já tratado.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}

/** O roteador com o mesmo movimento dos links, para quem navega por código. */
export function useMotionRouter() {
  const router = useRouter();
  return useMemo(() => {
    const kindTo = (href: string) => navKind(window.location.pathname, pathOf(href), isPhone());
    return {
      push: (href: string) => startNavigationTransition(kindTo(href), () => router.push(href)),
      replace: (href: string) => startNavigationTransition(kindTo(href), () => router.replace(href)),
      back: () => startNavigationTransition("close", () => router.back()),
      /** Carrega a tela de destino antes de precisar dela, para a troca não esperar por ela. */
      prefetch: (href: string) => router.prefetch?.(href),
    };
  }, [router]);
}
