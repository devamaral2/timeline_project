"use client";

import { Bell, CircleUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useCurrentUser } from "@/lib/session/use-session";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { NotificationBell } from "./notification-bell";
import styles from "./shell.module.css";

/**
 * O campo "Buscar e criar" do cabeçalho: a porta do painel (chat com IA, criar,
 * pesquisar) no desktop, onde não há barra inferior. O atalho é ⌘ K no Mac e
 * Ctrl K no resto; quem escuta a tecla é o próprio painel (`mobile-navigation`).
 */
function HubTrigger({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  // No servidor não se sabe a plataforma: começa em "Ctrl K" e troca no Mac.
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘ K");
  }, []);

  return (
    <button type="button" className={styles.hubTrigger} onClick={onOpen} aria-label="Buscar e criar" title="Buscar e criar" aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts="Meta+K Control+K">
      <i className={styles.hubMark} aria-hidden><HermesGlyph /></i>
      <span>Buscar e criar</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

export function HeaderActions({ live, userId, darkMode, onThemeToggle, hubOpen, onOpenHub }: { live: boolean; userId?: string; darkMode: boolean; onThemeToggle: () => void; hubOpen: boolean; onOpenHub: () => void }) {
  const user = useCurrentUser();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  if (!live || !user) {
    return (
      <>
        <HubTrigger open={hubOpen} onOpen={onOpenHub} />
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
      <HubTrigger open={hubOpen} onOpen={onOpenHub} />
      {userId ? (
        <NotificationBell userId={userId} />
      ) : (
        <button type="button" className={styles.iconButton} aria-label="Notificações" title="Notificações" disabled>
          <Bell aria-hidden />
        </button>
      )}
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
