import type { TagSuggestionDto } from "@repo/contracts";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { SuggestTagsUseCase } from "./suggest-tags.usecase";

export const suggestTagsOperation = {
  method: "GET",
  path: "/api/tags",
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

/** `GET /api/tags`: as tags do proprio usuario que comecam com o texto, nunca as de outro. */
export function suggestTagsRoute(suggestTags: SuggestTagsUseCase): ApiRoute {
  return {
    ...suggestTagsOperation,
    handler: ({ query, actor }): Promise<TagSuggestionDto[]> =>
      suggestTags.execute({ query: single(query.query) ?? "", limit: positiveInteger(query.limit) }, actor),
  };
}
