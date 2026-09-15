import { useEffect, useSyncExternalStore } from "react";
import { env } from "@/config/env";
import { createAuthClient } from "./auth-client";
import { createSessionStore, type SessionState } from "./session-store";
import { tokenStorage } from "./token-storage";

export type { SessionState, SignInResult } from "./session-store";

/** A sessao unica do app. */
export const session = createSessionStore({ client: createAuthClient(env.authBaseUrl), storage: tokenStorage });

export function useSession(): SessionState {
  const state = useSyncExternalStore(session.subscribe, session.getState);

  useEffect(() => {
    void session.restore();
  }, []);

  return state;
}
