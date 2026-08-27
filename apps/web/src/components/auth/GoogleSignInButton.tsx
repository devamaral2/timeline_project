"use client";

import { useState } from "react";
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";
import { useCurrentUser } from "@/lib/firebase/use-current-user";

export function GoogleSignInButton() {
  const user = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const auth = getAuth(getClientApp());
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Não foi possível entrar com o Google. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const auth = getAuth(getClientApp());
    await signOut(auth);
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={loading}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.66z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.93H1.29v3.1C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.31 14.3A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.39-2.3V6.6H1.29A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.29 5.4z"
          />
          <path
            fill="#EA4335"
            d="M12 4.77c1.76 0 3.35.6 4.6 1.79l3.44-3.44C17.94 1.19 15.23 0 12 0 7.31 0 3.26 2.7 1.29 6.6l4.02 3.1C6.25 6.87 8.89 4.77 12 4.77z"
          />
        </svg>
        {loading ? "Entrando..." : "Entrar com Google"}
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
