"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { signOut, useCurrentUser } from "@/lib/session/use-session";
import styles from "./shell.module.css";

/** A tela "Configurações" do painel: aparência e conta, as opções do antigo menu do cabeçalho. */
export function SettingsView({ darkMode, onThemeToggle, onSignedOut }: { darkMode: boolean; onThemeToggle: () => void; onSignedOut: () => void }) {
  const user = useCurrentUser();

  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  return (
    <section className={styles.settingsView} aria-label="Configurações">
      <h2>Configurações</h2>
      <button type="button" onClick={onThemeToggle}>
        {darkMode ? <Sun aria-hidden /> : <Moon aria-hidden />}
        {darkMode ? "Tema claro" : "Tema escuro"}
      </button>
      {user && (
        <button type="button" onClick={() => void handleSignOut()}>
          <LogOut aria-hidden />
          Sair da conta
        </button>
      )}
    </section>
  );
}
