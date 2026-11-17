/** O link que abre o local no Google Maps (busca por texto: dispensa chave e coordenadas). */
export function mapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}
