"use client";

import { useState } from "react";
import { signIn, type SignInResult } from "@/lib/session/use-session";
import styles from "./login.module.css";

const FAILURE_MESSAGES: Record<Extract<SignInResult, { ok: false }>["reason"], string> = {
  // Nunca diz qual dos dois estava errado: o apps/auth tambem nao diz.
  invalid_credentials: "E-mail ou senha incorretos.",
  rate_limited: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  unavailable: "Não foi possível entrar agora. Tente novamente em instantes.",
};

interface LoginFormProps {
  onSignedIn?: (userId: string) => void;
}

export function LoginForm({ onSignedIn }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const result = await signIn(email.trim(), password);

    setLoading(false);
    if (!result.ok) {
      setError(FAILURE_MESSAGES[result.reason]);
      return;
    }
    onSignedIn?.(result.user.userId);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className={styles.form}>
      <label className={styles.field}>
        <span>E-mail</span>
        <input
          type="email"
          required
          maxLength={320}
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Senha</span>
        <input
          type="password"
          required
          maxLength={1024}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p role="alert" className={styles.error}>{error}</p> : null}

      <button type="submit" disabled={loading || !email || !password} className={styles.submit}>
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
