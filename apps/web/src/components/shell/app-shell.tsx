"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExecutionDrawer } from "./execution-drawer";
import { HeaderActions } from "./header-actions";
import { type HubHandle, MobileNavigation } from "./mobile-navigation";
import { NavigationMotion } from "./navigation-motion";
import { PrimaryNavigation } from "./primary-navigation";
import styles from "./shell.module.css";

/** A assinatura: "Agente pessoal" na serifa, sem símbolo. */
function BrandLogo() {
  return <span className={styles.wordmark}>Agente pessoal</span>;
}

/** As três abas (Agenda, Tarefas e Documentos) são as telas que têm a barra inferior; o detalhe, a edição e a criação não. */
function isTabRoot(pathname: string | null, userId: string | undefined): boolean {
  if (!userId || !pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return path === `/${userId}` || path === `/${userId}/tarefas` || path === `/${userId}/notas`;
}

export function AppShell({
  children,
  live,
  userId,
}: {
  children: ReactNode;
  live?: boolean;
  userId?: string;
}) {
  const [darkMode, setDarkMode] = useState(false);
  // O painel "Buscar e criar" mora na navegação; o cabeçalho só pede para
  // abri-lo e mostra se está aberto.
  const hubRef = useRef<HubHandle | null>(null);
  const [hubOpen, setHubOpen] = useState(false);
  // O menu da seção (filtros e modos) sobe da barra por cima dela, e a gaveta de execução sai de vista com ele.
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // O tema ja chega resolvido no <html> pelo script do layout raiz (sistema ou
  // escolha salva); aqui so se le e, ao trocar, se fixa a escolha.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDarkMode(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem("braid-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <div className={`${styles.shell} ${darkMode ? styles.dark : ""}`}>
      <NavigationMotion />
      <a href="#conteudo" className={styles.skipLink}>Pular para o conteúdo</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href={userId ? `/${userId}` : "/mockups/tarefas"} className={styles.brand} aria-label="Agente pessoal — agenda">
            <BrandLogo />
          </a>
          <PrimaryNavigation userId={userId} />
          <div className={styles.headerActions}><HeaderActions live={live ?? false} userId={userId} darkMode={darkMode} onThemeToggle={toggleTheme} hubOpen={hubOpen} onOpenHub={() => hubRef.current?.open()} /></div>
        </div>
      </header>
      {children}
      <MobileNavigation userId={userId} hubRef={hubRef} onHubOpenChange={setHubOpen} onMenuOpenChange={setMenuOpen} darkMode={darkMode} onThemeToggle={toggleTheme} />
      {/* Depois da barra no DOM, para ficar por cima do degradê que apaga o conteúdo atrás dela. */}
      {userId ? <ExecutionDrawer userId={userId} active={isTabRoot(pathname, userId)} covered={hubOpen || menuOpen} /> : null}
    </div>
  );
}
