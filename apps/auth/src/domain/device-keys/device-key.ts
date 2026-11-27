import { DEVICE_KEY_PREFIX, TRANSCRIPTION_WORK_PERMISSION } from "@repo/contracts/device-key";

/**
 * Chave de dispositivo: credencial de vida longa e revogavel que um servico
 * rodando fora da VPS (o servico local de transcricao) usa no lugar de uma
 * sessao. Ela NAO e uma permissao de papel (RBAC): vive em `device_keys`, tem
 * uma unica permissao e so vale nas rotas que o gateway lista para ela.
 */
export const DEVICE_PERMISSIONS = [TRANSCRIPTION_WORK_PERMISSION] as const;
export type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];

export function looksLikeDeviceKey(token: string): boolean {
  return token.startsWith(DEVICE_KEY_PREFIX);
}

/** Quem a chave representa depois de validada. */
export interface DeviceKeyIdentity {
  keyId: string;
  userId: string;
  permission: DevicePermission;
}

/**
 * Unico prefixo de rota que o gateway abre para a chave de dispositivo: as tres
 * operacoes do servico local de transcricao (reservar, renovar o lease, entregar).
 * Nenhuma outra rota aceita a chave, e esta nao aceita sessao comum.
 */
export const DEVICE_ROUTE_PREFIX = "api/transcription-worker";
