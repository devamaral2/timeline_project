import type { GeoPointInput, PlaceSuggestionDto } from "@repo/contracts";
import { apiRequest } from "./client-request";

/** Rota que cada funcao desta area chama, no formato do catalogo da API. `route-coverage.test.ts` confere. */
export const placesRoutes = {
  searchPlaces: "GET /api/places",
} as const;

/** Cerca de 1 km: o bastante para trazer primeiro o que esta perto, sem mandar a posicao exata num endereco. */
const NEAR_DECIMALS = 2;

/**
 * Locais que combinam com o texto digitado: a API consulta o servico de mapas, o navegador nao. Com `near` (onde
 * a pessoa esta), os locais mais perto vem primeiro.
 */
export function searchPlaces(query: string, limit?: number, near?: GeoPointInput): Promise<PlaceSuggestionDto[]> {
  return apiRequest<PlaceSuggestionDto[]>("GET", "/api/places", {
    query: {
      query, limit,
      ...(near ? { lat: near.latitude.toFixed(NEAR_DECIMALS), lon: near.longitude.toFixed(NEAR_DECIMALS) } : {}),
    },
  });
}
