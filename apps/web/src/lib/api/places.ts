import type { PlaceSuggestionDto } from "@repo/contracts";
import { apiRequest } from "./client-request";

/** Rota que cada funcao desta area chama, no formato do catalogo da API. `route-coverage.test.ts` confere. */
export const placesRoutes = {
  searchPlaces: "GET /api/places",
} as const;

/** Locais que combinam com o texto digitado: a API consulta o servico de mapas, o navegador nao. */
export function searchPlaces(query: string, limit?: number): Promise<PlaceSuggestionDto[]> {
  return apiRequest<PlaceSuggestionDto[]>("GET", "/api/places", { query: { query, limit } });
}
