import type { StoredSession, TokenStorage } from "./token-storage-types";

const KEY = "braid.session";

/**
 * A mesma coisa que `token-storage.ts`, para o alvo web do Expo — util para
 * depurar as telas no navegador. O SecureStore nao tem implementacao web; o
 * `localStorage` e o equivalente mais proximo, e so serve para desenvolvimento.
 */
export const tokenStorage: TokenStorage = {
  async load() {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },

  async save(session) {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(session));
  },

  async clear() {
    globalThis.localStorage?.removeItem(KEY);
  },
};
