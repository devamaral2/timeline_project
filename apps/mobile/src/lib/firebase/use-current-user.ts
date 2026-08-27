import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getClientAuth } from "./app";

export interface CurrentUser {
  user: User | null;
  /**
   * Falso ate o Firebase terminar de reler a sessao do AsyncStorage. No web
   * isso e instantaneo; aqui a leitura e assincrona, e sem esta distincao a
   * tela de login pisca antes de o app perceber que ja havia alguem logado.
   */
  ready: boolean;
}

export function useCurrentUser(): CurrentUser {
  const [state, setState] = useState<CurrentUser>({ user: null, ready: false });

  useEffect(
    () => onAuthStateChanged(getClientAuth(), (user) => setState({ user, ready: true })),
    [],
  );

  return state;
}
