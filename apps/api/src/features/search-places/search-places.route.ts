import type { PlaceSuggestionDto } from "@repo/contracts";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { SearchPlacesUseCase } from "./search-places.usecase";

export const searchPlacesOperation = {
  method: "GET",
  path: "/api/places",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** A query repetida chega como lista; juntar preserva o `Number` que o controller fazia (`["3"]` virava 3). */
function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(",") : value;
}

/** O `limit` so vale como inteiro positivo; qualquer outra coisa cai no padrao do caso de uso. */
function positiveInteger(value: string | string[] | undefined): number | undefined {
  const requested = Number(single(value));
  return Number.isInteger(requested) && requested > 0 ? requested : undefined;
}

/** `GET /api/places`: busca por texto nos mapas; o caso de uso decide o minimo de letras e o teto. */
export function searchPlacesRoute(searchPlaces: SearchPlacesUseCase): ApiRoute {
  return {
    ...searchPlacesOperation,
    handler: ({ query }): Promise<PlaceSuggestionDto[]> =>
      searchPlaces.execute({ query: single(query.query) ?? "", limit: positiveInteger(query.limit) }),
  };
}
