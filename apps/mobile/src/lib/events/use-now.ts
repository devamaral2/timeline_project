import { useSyncExternalStore } from "react";
import { secondsSnapshot, subscribeToSeconds } from "@repo/timeline";

/**
 * O instante atual, avancando de segundo em segundo. O relogio em si vive em
 * `@repo/timeline` — e o mesmo que o web usa.
 */
export function useNow(): Date {
  // O terceiro argumento e o snapshot do servidor; o React Native nunca pede,
  // mas o react-native-web pediria.
  return new Date(useSyncExternalStore(subscribeToSeconds, secondsSnapshot, secondsSnapshot));
}
