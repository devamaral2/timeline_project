"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { AgendaHeaderActions } from "./agenda-header-actions";
import { MobileNavigation } from "./mobile-navigation";
import styles from "./mockup.module.css";

export function BrandIcon() {
  return (
    <span className={styles.brandIcon}>
      <Image src="/mockups/braid/icon.png" alt="" width={80} height={80} priority />
    </span>
  );
}

function BrandLogo() {
  return <span className={styles.wordmark}>Braid</span>;
}

export function MockupShell({
  children,
  fontClasses,
  live,
  userId,
}: {
  children: ReactNode;
  fontClasses: string;
  live?: boolean;
  userId?: string;
}) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(window.localStorage.getItem("braid-theme") === "dark");
  }, []);

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      window.localStorage.setItem("braid-theme", next ? "dark" : "light");
      return next;
    });
  }

  return (
    <div className={`${styles.shell} ${fontClasses} ${darkMode ? styles.dark : ""}`}>
      <a href="#conteudo" className={styles.skipLink}>Pular para o conteúdo</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href={userId ? `/${userId}` : "/mockups/eventos"} className={styles.brand} aria-label="Braid — agenda">
            <BrandLogo />
          </a>
          <div className={styles.headerActions}><AgendaHeaderActions live={live ?? false} darkMode={darkMode} onThemeToggle={toggleTheme} /></div>
        </div>
      </header>
      {children}
      <MobileNavigation userId={userId} />
    </div>
  );
}
