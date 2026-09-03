"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";

export interface AuthState {
  user: User | null;
  /**
   * Se o Firebase ja respondeu quem esta logado.
   *
   * `user: null` sozinho e ambiguo — significa tanto "ninguem entrou" quanto
   * "ainda estou perguntando". Quem le a API precisa da diferenca: pedir antes
   * da resposta e um 401 garantido, e mostrar "entre na sua conta" antes dela e
   * acusar de deslogado quem so esperou meio segundo.
   */
  ready: boolean;
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, ready: false });

  useEffect(() => {
    const auth = getAuth(getClientApp());
    return onAuthStateChanged(auth, (user) => setState({ user, ready: true }));
  }, []);

  return state;
}

export function useCurrentUser(): User | null {
  return useAuthState().user;
}
