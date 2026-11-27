/**
 * Constantes da chave de dispositivo e da entrega do serviço local de transcrição (spec #39) que o auth, a API e o
 * serviço local precisam ler iguais. É JS de verdade (o `index.ts` só tem tipos), por isso tem o subpath
 * `@repo/contracts/device-key`: quem importa daqui não carrega o zod do `schemas.ts`.
 */

/** A única permissão da chave de dispositivo: reservar, renovar e entregar pedidos de transcrição. */
export const TRANSCRIPTION_WORK_PERMISSION = "transcription:work";

/** O cabeçalho com que o gateway encaminha a permissão da chave para a API. */
export const DEVICE_PERMISSIONS_HEADER = "x-auth-permissions";

/** O prefixo que distingue a chave de dispositivo de um JWT de sessão no `Authorization: Bearer`. */
export const DEVICE_KEY_PREFIX = "bdk_";

/**
 * O teto do corpo da entrega do serviço local (`POST /api/transcription-worker/deliver`), no gateway e na API. A
 * entrega vale até `TRANSCRIPTION_DELIVERY_MAX_BYTES` (2 MiB, na API); entre os dois a recusa é uma resposta do
 * pedido, e acima deste o corpo é cortado (413).
 */
export const TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
