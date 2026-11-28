"use client";

import { useCurrentUser } from "@/lib/session/use-session";
import { NotificationBell } from "./notification-bell";
import styles from "./shell.module.css";

/**
 * O que restou do cabeçalho: o sino, invisível, que só entrega os avisos
 * (toasts). Navegar, abrir o chat, trocar o tema e sair ficam na barra
 * inferior e no painel.
 */
export function NotificationHost({ live, userId }: { live: boolean; userId?: string }) {
  const user = useCurrentUser();
  if (!live || !user || !userId) return null;
  return (
    <div className={styles.notificationHost}>
      <NotificationBell userId={userId} />
    </div>
  );
}
