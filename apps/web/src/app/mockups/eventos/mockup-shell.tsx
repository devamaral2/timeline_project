"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { AgendaHeaderActions } from "./agenda-header-actions";
import { MobileNavigation } from "./mobile-navigation";
import { PrimaryNavigation } from "./primary-navigation";
import styles from "./mockup.module.css";

export function BrandIcon() {
  return (
    <span className={styles.brandIcon}>
      <Image src="/mockups/braid/icon.png" alt="" width={80} height={80} priority />
    </span>
  );
}

/** A assinatura: "braid" na serifa, em minusculas. */
function BrandLogo() {
  return <span className={styles.wordmark}>braid</span>;
}

export function MockupShell({
  children,
  live,
  userId,
}: {
  children: ReactNode;
  live?: boolean;
  userId?: string;
}) {
  const [darkMode, setDarkMode] = useState(false);

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
      <a href="#conteudo" className={styles.skipLink}>Pular para o conteúdo</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href={userId ? `/${userId}` : "/mockups/eventos"} className={styles.brand} aria-label="Braid — agenda">
            <BrandLogo />
          </a>
          <PrimaryNavigation userId={userId} />
          <div className={styles.headerActions}><AgendaHeaderActions live={live ?? false} userId={userId} darkMode={darkMode} onThemeToggle={toggleTheme} /></div>
        </div>
      </header>
      {children}
      <MobileNavigation userId={userId} />
    </div>
  );
}
