import * as SecureStore from "expo-secure-store";
import type { StoredSession, TokenStorage } from "./token-storage-types";

const KEYS = {
  accessToken: "braid.session.access",
  refreshToken: "braid.session.refresh",
  user: "braid.session.user",
} as const;

/**
 * Keychain no iOS, Keystore no Android. `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`:
 * a sessao pode ser lida com a tela bloqueada depois do primeiro desbloqueio
 * (uma renovacao em segundo plano nao falha), mas nunca viaja num backup para
 * outro aparelho — la ela seria um refresh token clonado.
 *
 * Tres itens em vez de um JSON: o SecureStore recusa valores grandes, e o
 * access token carrega papeis e permissoes.
 *
 * Ha um irmao `token-storage.web.ts` para o alvo web do Expo, onde o
 * SecureStore nao existe.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const tokenStorage: TokenStorage = {
  async load() {
    const [accessToken, refreshToken, user] = await Promise.all([
      SecureStore.getItemAsync(KEYS.accessToken, OPTIONS),
      SecureStore.getItemAsync(KEYS.refreshToken, OPTIONS),
      SecureStore.getItemAsync(KEYS.user, OPTIONS),
    ]);
    return parseStoredSession(accessToken, refreshToken, user);
  },

  async save(session) {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, session.accessToken, OPTIONS),
      SecureStore.setItemAsync(KEYS.refreshToken, session.refreshToken, OPTIONS),
      SecureStore.setItemAsync(KEYS.user, JSON.stringify(session.user), OPTIONS),
    ]);
  },

  async clear() {
    await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key, OPTIONS)));
  },
};

function parseStoredSession(accessToken: string | null, refreshToken: string | null, user: string | null): StoredSession | null {
  if (!accessToken || !refreshToken || !user) return null;
  try {
    return { accessToken, refreshToken, user: JSON.parse(user) as StoredSession["user"] };
  } catch {
    return null;
  }
}
