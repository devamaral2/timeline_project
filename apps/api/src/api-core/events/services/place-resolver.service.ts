import type { GeoPointInput } from "@repo/contracts";
import { MAX_EVENT_LOCATION_LENGTH } from "../../../domain";
import type { FoundPlace, PlaceSearchGateway } from "../../../infrastructure/places/photon-place-search.gateway";

const MIN_SAID_LENGTH = 3;
const SEARCH_LIMIT = 8;
/** Ate aqui o local e "perto" da pessoa: havendo um assim, os de longe nem concorrem. */
const NEARBY_KM = 100;
const EARTH_RADIUS_KM = 6371;

/** Palavras que nao distinguem um lugar de outro. */
const FILLER = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "ao", "aos", "para", "pra",
]);

function words(text: string): string[] {
  return text
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER.has(word));
}

/**
 * O local achado e o que a pessoa disse? Toda palavra dita tem de aparecer nele (sem acento nem caixa). A busca do
 * mapa devolve tambem o que so parece ("Clinica Saude VR" para "clinica saude emocional"); esses ficam de fora.
 */
export function namesPlace(said: string, place: FoundPlace): boolean {
  const wanted = words(said);
  const have = new Set(words(place.label));
  return wanted.length > 0 && wanted.every((word) => have.has(word));
}

export function distanceKm(from: GeoPointInput, to: GeoPointInput): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const half =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(half));
}

/**
 * Entre os locais achados (na ordem do mapa, que ja pesa relevancia e distancia), o primeiro que e o que a pessoa
 * disse. Sabendo onde ela esta, um local perto ganha de qualquer um de longe; so sem nenhum perto vale um distante.
 */
export function pickPlace(said: string, found: readonly FoundPlace[], near?: GeoPointInput): FoundPlace | undefined {
  const matches = found.filter((place) => namesPlace(said, place));
  if (!near) return matches[0];
  const nearby = matches.filter((place) => place.point && distanceKm(near, place.point) <= NEARBY_KM);
  return nearby[0] ?? matches[0];
}

/**
 * O local que a IA tirou do pedido ("clinica saude emocional") vira o endereco de um lugar que existe no mapa, o
 * mais perto de onde a pessoa esta. Sem um lugar que bata com o que foi dito (ou com o mapa fora do ar), fica o
 * texto como a pessoa disse: um endereco errado e pior que nenhum.
 */
export class PlaceResolver {
  constructor(private readonly places: PlaceSearchGateway) {}

  async resolve(said: string, near?: GeoPointInput): Promise<string> {
    const text = said.trim().slice(0, MAX_EVENT_LOCATION_LENGTH);
    if (text.length < MIN_SAID_LENGTH) return text;
    const found = await this.places.search(text, SEARCH_LIMIT, near).catch(() => []);
    return (pickPlace(text, found, near)?.label ?? text).slice(0, MAX_EVENT_LOCATION_LENGTH);
  }
}
