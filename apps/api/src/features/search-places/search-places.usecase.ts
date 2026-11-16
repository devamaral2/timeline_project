import type { GeoPointInput, PlaceSuggestionDto } from "@repo/contracts";
import type { PlaceSearchGateway } from "../../infrastructure/places/photon-place-search.gateway";

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;

export class SearchPlacesUseCase {
  constructor(private readonly places: PlaceSearchGateway) {}

  /** Com `near` (onde a pessoa esta), os locais mais perto vem primeiro. */
  async execute(input: { query: string; limit?: number; near?: GeoPointInput }): Promise<PlaceSuggestionDto[]> {
    const query = input.query.trim().slice(0, MAX_QUERY_LENGTH);
    if (query.length < MIN_QUERY_LENGTH) return [];
    const found = await this.places.search(query, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT), input.near);
    // O ponto no mapa serve so para ordenar e escolher: o cliente recebe o texto do local.
    return found.map(({ name, address, label }) => ({ name, address, label }));
  }
}
