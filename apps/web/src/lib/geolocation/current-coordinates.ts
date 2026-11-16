import type { GeoPointInput } from "@repo/contracts";

const TIMEOUT_MS = 4_000;
/** Uma posição de até 5 minutos serve: o pedido não precisa do metro exato, só de um endereço. */
const MAX_AGE_MS = 5 * 60_000;

/**
 * Onde a pessoa está, lido pelo navegador. Todo evento criado por uma pessoa nasce com o local daqui: a API
 * converte as coordenadas em endereço. Sem permissão, sem suporte ou sem resposta a tempo, devolve `undefined` e
 * o pedido segue sem coordenadas: a localização nunca bloqueia criar um evento.
 */
export function currentCoordinates(): Promise<GeoPointInput | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(undefined),
      { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS, enableHighAccuracy: false },
    );
  });
}
