import { AuthRequestError, type AuthClient, type AuthUser } from "./auth-client";
import type { StoredSession, TokenStorage } from "./token-storage-types";

export interface SessionState {
  user: AuthUser | null;
  /**
   * Falso ate a sessao ser relida do SecureStore. A leitura e assincrona, e sem
   * esta distincao a tela de login pisca antes de o app perceber que ja havia
   * alguem logado.
   */
  ready: boolean;
}

export type SignInResult = { ok: true; user: AuthUser } | { ok: false; reason: AuthRequestError["reason"] };

/** Renova um pouco antes do `exp`: o relogio do aparelho nao e o do servidor. */
const EXPIRY_MARGIN_SECONDS = 30;

/**
 * A sessao do app, sem nenhum import do React Native — a logica e testada no
 * Vitest com client e storage falsos. `session.ts` monta a instancia real.
 */
export function createSessionStore(deps: { client: AuthClient; storage: TokenStorage; now?: () => number }) {
  const now = deps.now ?? Date.now;
  let state: SessionState = { user: null, ready: false };
  let session: StoredSession | null = null;
  let restoring: Promise<void> | null = null;
  let refreshing: Promise<string | null> | null = null;
  const listeners = new Set<() => void>();

  function set(next: StoredSession | null): void {
    session = next;
    state = { user: next?.user ?? null, ready: true };
    for (const listener of listeners) listener();
  }

  function restore(): Promise<void> {
    if (state.ready) return Promise.resolve();
    restoring ??= deps.storage
      .load()
      .catch(() => null)
      .then((stored) => {
        // Um login que terminou durante a leitura vale mais que o que estava gravado.
        if (!state.ready) set(stored);
      });
    return restoring;
  }

  async function forget(): Promise<void> {
    set(null);
    await deps.storage.clear().catch(() => {});
  }

  /**
   * O apps/auth rotaciona o refresh token e trata a reapresentacao de um token
   * ja usado como roubo: derruba a sessao. Por isso chamadas simultaneas
   * compartilham uma unica renovacao.
   *
   * Devolve o novo access token, ou `null` quando a sessao acabou. Sem rede,
   * lanca: o usuario continua logado e tenta de novo depois.
   */
  function refresh(): Promise<string | null> {
    refreshing ??= (async () => {
      await restore();
      const current = session;
      if (!current) return null;
      try {
        const tokens = await deps.client.refresh(current.refreshToken);
        const next = { ...current, ...tokens };
        // Se o usuario saiu enquanto a renovacao viajava, nao ressuscita a sessao.
        if (session !== current) return session?.accessToken ?? null;
        await deps.storage.save(next);
        set(next);
        return next.accessToken;
      } catch (error) {
        if (error instanceof AuthRequestError && error.reason === "invalid_credentials") {
          await forget();
          return null;
        }
        throw error;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  return {
    getState: (): SessionState => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    restore,
    refresh,

    /** O access token valido agora, renovando se ele ja expirou. `null` sem sessao. */
    async getAccessToken(): Promise<string | null> {
      await restore();
      if (!session) return null;
      if (secondsLeft(session.accessToken, now()) > EXPIRY_MARGIN_SECONDS) return session.accessToken;
      return refresh();
    },

    async signIn(email: string, password: string): Promise<SignInResult> {
      try {
        const tokens = await deps.client.login(email, password);
        const user = await deps.client.me(tokens.accessToken);
        const next = { ...tokens, user };
        await deps.storage.save(next);
        set(next);
        return { ok: true, user };
      } catch (error) {
        return { ok: false, reason: error instanceof AuthRequestError ? error.reason : "unavailable" };
      }
    },

    async signOut(): Promise<void> {
      const current = session;
      await forget();
      // O logout e idempotente no apps/auth; sem rede, o aparelho sai assim mesmo.
      if (current) await deps.client.logout(current.refreshToken).catch(() => {});
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/** Quanto falta para o `exp` do JWT. So decodifica: quem verifica e o apps/auth. */
export function secondsLeft(jwt: string, nowMs: number): number {
  try {
    const segment = (jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, "="))) as { exp?: unknown };
    if (typeof payload.exp === "number") return payload.exp - nowMs / 1000;
  } catch {
    // Token ilegivel: tratado como expirado, e a renovacao decide.
  }
  return 0;
}
