import { MAX_TASK_LOCATION_LENGTH } from "../../../domain/index";
import type { FoundPlace, PlaceSearchGateway } from "../../../infrastructure/places/photon-place-search.gateway";

const MIN_SAID_LENGTH = 3;
const SEARCH_LIMIT = 8;

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

/** Entre os locais achados (na ordem do mapa, que ja pesa a relevancia), o primeiro que e o que a pessoa disse. */
export function pickPlace(said: string, found: readonly FoundPlace[]): FoundPlace | undefined {
  return found.find((place) => namesPlace(said, place));
}

/**
 * O local que a IA tirou do pedido ("clinica saude emocional") vira o endereco de um lugar que existe no mapa, o
 * que melhor combina com o texto. Sem um lugar que bata com o que foi dito (ou com o mapa fora do ar), fica o
 * texto como a pessoa disse: um endereco errado e pior que nenhum.
 */
export class PlaceResolver {
  constructor(private readonly places: PlaceSearchGateway) {}

  async resolve(said: string): Promise<string> {
    const text = said.trim().slice(0, MAX_TASK_LOCATION_LENGTH);
    if (text.length < MIN_SAID_LENGTH) return text;
    const found = await this.places.search(text, SEARCH_LIMIT).catch(() => []);
    return (pickPlace(text, found)?.label ?? text).slice(0, MAX_TASK_LOCATION_LENGTH);
  }
}
