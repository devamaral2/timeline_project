import type { PlaceSuggestionDto } from "@repo/contracts";
import type { PlaceSearchGateway } from "../../infrastructure/places/photon-place-search.gateway";

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;

export class SearchPlacesUseCase {
  constructor(private readonly places: PlaceSearchGateway) {}

  async execute(input: { query: string; limit?: number }): Promise<PlaceSuggestionDto[]> {
    const query = input.query.trim().slice(0, MAX_QUERY_LENGTH);
    if (query.length < MIN_QUERY_LENGTH) return [];
    const found = await this.places.search(query, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    return found.map(({ name, address, label }) => ({ name, address, label }));
  }
}
