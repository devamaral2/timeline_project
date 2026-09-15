"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SessionUser } from "./auth-service";
import { refreshSession } from "./refresh-session";

export type { SessionUser };

export interface SessionState {
  user: SessionUser | null;
  /**
   * Se o servidor ja respondeu quem esta logado.
   *
   * `user: null` sozinho e ambiguo — significa tanto "ninguem entrou" quanto
   * "ainda estou perguntando". Quem le a API precisa da diferenca: pedir antes
   * da resposta e um 401 garantido, e mostrar "entre na sua conta" antes dela e
   * acusar de deslogado quem so esperou meio segundo.
   */
  ready: boolean;
}

export type SignInResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" | "unavailable" };

const INITIAL: SessionState = { user: null, ready: false };

let state: SessionState = INITIAL;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function fetchSessionUser(): Promise<Response> {
  return fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
}

/**
 * Pergunta ao Next quem esta logado. O access token vive 15 minutos e o cookie
 * some com ele; um 401 aqui ainda pode ter um refresh valido por tras, entao a
 * sessao e renovada uma vez antes de concluir que ninguem entrou.
 */
export function loadSession(): Promise<void> {
  loading ??= (async () => {
    try {
      let response = await fetchSessionUser();
      if (response.status === 401 && (await refreshSession())) response = await fetchSessionUser();
      setState({ user: response.ok ? ((await response.json()) as SessionUser) : null, ready: true });
    } catch {
      setState({ user: null, ready: true });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function useSessionState(): SessionState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);

  useEffect(() => {
    if (!state.ready) void loadSession();
  }, []);

  return snapshot;
}

export function useCurrentUser(): SessionUser | null {
  return useSessionState().user;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  let response: Response;
  try {
    response = await fetch("/api/session/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.ok) {
    const user = (await response.json()) as SessionUser;
    setState({ user, ready: true });
    return { ok: true, user };
  }
  if (response.status === 401 || response.status === 400) return { ok: false, reason: "invalid_credentials" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "unavailable" };
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/session/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    setState({ user: null, ready: true });
  }
}

/** So para testes: volta ao estado de antes da primeira pergunta. */
export function resetSessionForTests(): void {
  loading = null;
  setState(INITIAL);
}
