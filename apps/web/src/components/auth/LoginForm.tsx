"use client";

import { useState } from "react";
import { primaryButtonClass } from "@/components/ui/button-styles";
import { signIn, type SignInResult } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";

const FAILURE_MESSAGES: Record<Extract<SignInResult, { ok: false }>["reason"], string> = {
  // Nunca diz qual dos dois estava errado: o apps/auth tambem nao diz.
  invalid_credentials: "E-mail ou senha incorretos.",
  rate_limited: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  unavailable: "Não foi possível entrar agora. Tente novamente em instantes.",
};

const inputClass =
  "h-10 rounded-lg border border-input bg-card/40 px-3 text-sm text-foreground transition-colors focus:border-ring";

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
    <form onSubmit={(event) => void handleSubmit(event)} className="flex w-full flex-col gap-3 text-left">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">E-mail</span>
        <input
          type="email"
          required
          maxLength={320}
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Senha</span>
        <input
          type="password"
          required
          maxLength={1024}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </label>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={loading || !email || !password} className={cn(primaryButtonClass, "mt-1 w-full")}>
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
