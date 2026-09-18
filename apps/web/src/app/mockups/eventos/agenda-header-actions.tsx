"use client";

import { Bell, CircleUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { NewEventButton } from "@/components/events/NewEventButton";
import { signOut, useCurrentUser } from "@/lib/session/use-session";
import { requestAgendaRefresh } from "./agenda-refresh";
import styles from "./mockup.module.css";

export function AgendaHeaderActions({ live, darkMode, onThemeToggle }: { live: boolean; darkMode: boolean; onThemeToggle: () => void }) {
  const user = useCurrentUser();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  if (!live || !user) {
    return (
      <>
        <button type="button" className={styles.iconButton} aria-label="Notificações" title="Notificações" disabled>
          <Bell aria-hidden />
        </button>
        <button type="button" className={styles.iconButton} aria-label="Minha conta" title="Minha conta" disabled>
          <CircleUserRound aria-hidden />
        </button>
      </>
    );
  }

  return (
    <>
      <NewEventButton onCreated={requestAgendaRefresh} compactOnMobile className={`${styles.headerActionButton} ${styles.headerCreateButton}`} />
      <button type="button" className={styles.iconButton} aria-label="Notificações" title="Notificações" disabled>
        <Bell aria-hidden />
      </button>
      <details className={styles.accountMenu}>
        <summary className={styles.iconButton} aria-label="Minha conta" title="Minha conta"><CircleUserRound aria-hidden /></summary>
        <div className={styles.accountPopover}>
          <button type="button" onClick={onThemeToggle}>{darkMode ? "Tema claro" : "Tema escuro"}</button>
          <button type="button" onClick={() => void handleSignOut()}>Sair da conta</button>
        </div>
      </details>
    </>
  );
}
