import type { GeoPointInput, PlaceSuggestionDto } from "@repo/contracts";

/** Um local achado, com o ponto no mapa quando o servico o informa: e o que mede a distancia ate a pessoa. */
export interface FoundPlace extends PlaceSuggestionDto {
  point?: GeoPointInput;
}

/**
 * Busca de locais por texto. A API e o intermediario: os clientes nunca falam com o servico de mapas.
 * Com `near`, os locais perto desse ponto vem primeiro.
 */
export interface PlaceSearchGateway {
  search(query: string, limit: number, near?: GeoPointInput): Promise<FoundPlace[]>;
}

export const PLACE_SEARCH_GATEWAY = Symbol("PLACE_SEARCH_GATEWAY");

/** O caminho inverso: das coordenadas ao endereco. Sem resposta (servico fora, mar aberto), devolve `undefined`. */
export interface PlaceReverseGateway {
  reverse(point: GeoPointInput): Promise<PlaceSuggestionDto | undefined>;
}

export const PLACE_REVERSE_GATEWAY = Symbol("PLACE_REVERSE_GATEWAY");

interface PhotonFeature {
  /** GeoJSON: longitude antes da latitude. */
  geometry?: { coordinates?: [number, number] };
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
const BIAS_DECIMALS = 2;

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

function toPoint(feature: PhotonFeature): GeoPointInput | undefined {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude: latitude as number, longitude: longitude as number }
    : undefined;
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

  async search(query: string, limit: number, near?: GeoPointInput): Promise<FoundPlace[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "default");
    if (near) {
      // O Photon pesa a distancia ate este ponto junto com a relevancia do texto. Duas casas (cerca de 1 km)
      // bastam para isso: a posicao exata da pessoa nao sai para o servico de mapas numa busca.
      url.searchParams.set("lat", near.latitude.toFixed(BIAS_DECIMALS));
      url.searchParams.set("lon", near.longitude.toFixed(BIAS_DECIMALS));
    }
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "timeline-api" } });
      if (!response.ok) return [];
      const body = (await response.json()) as { features?: PhotonFeature[] };
      const seen = new Set<string>();
      return (body.features ?? []).flatMap((feature) => {
        const place = toPlaceSuggestion(feature);
        if (!place || seen.has(place.label)) return [];
        seen.add(place.label);
        const point = toPoint(feature);
        return [point ? { ...place, point } : place];
      });
    } catch {
      // Servico de mapas fora do ar nao pode quebrar o formulario: o usuario digita o local a mao.
      return [];
    }
  }
}

/**
 * No Photon a busca e `/api` e a geocodificacao reversa e `/reverse`, lado a lado: `/api/reverse` nao existe (404).
 * Uma base que nao termina em `/api` e tratada como a raiz do servidor.
 */
export function reverseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/api$/, "")}/reverse`;
  return url;
}

/** Geocodificacao reversa no mesmo Photon da busca (`/reverse`). Qualquer falha vira "sem endereco". */
export class PhotonPlaceReverseGateway implements PlaceReverseGateway {
  constructor(
    private readonly baseUrl: string = process.env.PLACES_SEARCH_URL || DEFAULT_PHOTON_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async reverse(point: GeoPointInput): Promise<PlaceSuggestionDto | undefined> {
    const url = reverseUrl(this.baseUrl);
    url.searchParams.set("lat", String(point.latitude));
    url.searchParams.set("lon", String(point.longitude));
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", "default");
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "timeline-api" } });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { features?: PhotonFeature[] };
      const [feature] = body.features ?? [];
      return feature ? toPlaceSuggestion(feature) : undefined;
    } catch {
      return undefined;
    }
  }
}
