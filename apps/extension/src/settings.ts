/** O que a pessoa configura: o endereço do Candeia dela. */
export interface Settings {
  /** A origem do app web, sem barra no fim: `https://candeia.exemplo.dev`. Vazio enquanto não configurada. */
  baseUrl: string;
}

const KEY = "settings";

/**
 * O endereço digitado vira a origem do app: sem caminho, sem barra no fim e
 * com `https://` quando a pessoa não escreveu o protocolo. `null` se não for
 * um endereço `http(s)`.
 */
export function normalizeBaseUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** O padrão de permissão de host da origem. A porta não entra: o Chrome a ignora nos padrões. */
export function hostPermissionOf(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

export async function readSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { baseUrl: typeof stored?.baseUrl === "string" ? stored.baseUrl : "" };
}

export async function writeSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: settings });
}
