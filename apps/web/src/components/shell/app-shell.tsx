"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ExecutionDrawer } from "./execution-drawer";
import { NotificationHost } from "./notification-host";
import { MobileNavigation } from "./mobile-navigation";
import { NavigationMotion } from "./navigation-motion";
import { PullToRefresh } from "./pull-to-refresh";
import styles from "./shell.module.css";

/** As três abas (Agenda, Tarefas e Artefatos) são as telas que têm a barra inferior; o detalhe, a edição e a criação não. */
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
  // O painel "Buscar e criar" mora na navegação; a gaveta de execução sai de
  // vista enquanto ele está aberto.
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
      <PullToRefresh />
      <a href="#conteudo" className={styles.skipLink}>Pular para o conteúdo</a>
      {/* Sem cabeçalho: a barra inferior e o chat levam tudo. O sino fica montado só para entregar os avisos. */}
      <NotificationHost live={live ?? false} userId={userId} />
      {children}
      <MobileNavigation userId={userId} onHubOpenChange={setHubOpen} onMenuOpenChange={setMenuOpen} darkMode={darkMode} onThemeToggle={toggleTheme} />
      {/* Depois da barra no DOM, para ficar por cima do degradê que apaga o conteúdo atrás dela. */}
      {userId ? <ExecutionDrawer userId={userId} active={isTabRoot(pathname, userId)} covered={hubOpen || menuOpen} /> : null}
    </div>
  );
}
