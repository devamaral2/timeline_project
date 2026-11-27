/** As guardas com que as saídas JSON das ferramentas locais (yt-dlp, whisper.cpp, pyannote) são lidas, sem cast. */
export type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
export const text = (value: unknown): string => (typeof value === "string" ? value : "");
export const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
