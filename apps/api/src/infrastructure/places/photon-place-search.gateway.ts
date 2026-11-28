import type { PlaceSuggestionDto } from "@repo/contracts";

/** Um local achado. */
export type FoundPlace = PlaceSuggestionDto;

/**
 * Busca de locais por texto. A API e o intermediario: os clientes nunca falam com o servico de mapas, e nenhum
 * deles manda onde a pessoa esta.
 */
export interface PlaceSearchGateway {
  search(query: string, limit: number): Promise<FoundPlace[]>;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/";
const TIMEOUT_MS = 4_000;

function join(parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(", ");
}

export function toPlaceSuggestion(feature: PhotonFeature): PlaceSuggestionDto | undefined {
  const p = feature.properties;
  if (!p) return undefined;
  const street = join([p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : undefined]);
  const name = p.name?.trim() || street;
  if (!name) return undefined;
  const address = join([p.name?.trim() ? street : undefined, p.district, p.city ?? p.locality ?? p.county, p.state, p.country]);
  return { name, address, label: join([name, address]) };
}

/**
 * Photon (komoot) sobre dados do OpenStreetMap: busca por prefixo, sem chave.
 * `PLACES_SEARCH_URL` troca o servidor (uma instancia propria, por exemplo).
 */
export class PhotonPlaceSearchGateway implements PlaceSearchGateway {
  constructor(
    private readonly baseUrl: string = process.env.PLACES_SEARCH_URL || DEFAULT_PHOTON_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string, limit: number): Promise<FoundPlace[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "default");
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "timeline-api" } });
      if (!response.ok) return [];
      const body = (await response.json()) as { features?: PhotonFeature[] };
      const seen = new Set<string>();
      return (body.features ?? []).flatMap((feature) => {
        const place = toPlaceSuggestion(feature);
        if (!place || seen.has(place.label)) return [];
        seen.add(place.label);
        return [place];
      });
    } catch {
      // Servico de mapas fora do ar nao pode quebrar o formulario: o usuario digita o local a mao.
      return [];
    }
  }
}
