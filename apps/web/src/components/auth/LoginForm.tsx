"use client";

import { useState, type FormEvent } from "react";
import { signIn, signOut, useCurrentUser } from "@/lib/session/use-session";
import { outlineButtonClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

interface LoginFormProps { compactOnMobile?: boolean; }

export function LoginForm({ compactOnMobile = false }: LoginFormProps) {
  const user = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault(); setLoading(true); setError(null);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.ok) { window.location.assign(`/${result.user.userId}`); return; }
    setError(result.reason === "rate_limited" ? "Muitas tentativas. Aguarde e tente novamente." : result.reason === "unavailable" ? "Serviço indisponível. Tente novamente." : "E-mail ou senha inválidos.");
  }

  if (user) return <button type="button" onClick={() => void signOut()} className={cn(outlineButtonClass, compactOnMobile ? "w-10 px-0 sm:w-auto sm:px-4" : null)}>{compactOnMobile ? <span className="sr-only sm:not-sr-only">Sair</span> : "Sair"}</button>;

  return (
    <form onSubmit={(event) => void submit(event)} className="flex w-full flex-col gap-3 text-left">
      <label className="text-sm" htmlFor="login-email">E-mail</label>
      <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" required />
      <label className="text-sm" htmlFor="login-password">Senha</label>
      <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" required />
      <button type="submit" disabled={loading} className={outlineButtonClass}>{loading ? "Entrando..." : "Entrar"}</button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
