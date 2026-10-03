"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, NotepadText } from "lucide-react";
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
  const pathname = usePathname();
  const base = userId ? `/${userId}` : "/mockups/eventos";
  const notesOpen = pathname.endsWith("/notas");
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
          <nav className={styles.primaryNav} aria-label="Principal">
            <Link href={base} aria-current={!notesOpen ? "page" : undefined} className={!notesOpen ? styles.navActive : undefined}><CalendarDays aria-hidden />Agenda</Link>
            <Link href={`${base}/notas`} aria-current={notesOpen ? "page" : undefined} className={notesOpen ? styles.navActive : undefined}><NotepadText aria-hidden />Notas</Link>
          </nav>
          <div className={styles.headerActions}><AgendaHeaderActions live={live ?? false} darkMode={darkMode} onThemeToggle={toggleTheme} /></div>
        </div>
      </header>
      {children}
      <MobileNavigation userId={userId} />
    </div>
  );
}
