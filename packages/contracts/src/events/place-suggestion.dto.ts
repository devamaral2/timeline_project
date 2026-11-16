/** Um local achado na busca: `label` e o texto que o evento guarda e o Google Maps entende. */
export interface PlaceSuggestionDto {
  /** O nome do lugar ou, sem nome, o endereco curto. */
  name: string;
  /** O resto do endereco: rua, bairro e cidade. Pode ser vazio. */
  address: string;
  /** `name` e `address` juntos: o que vai para o campo `location` do evento. */
  label: string;
}

/**
 * Onde a pessoa esta, lido pelo navegador. A API converte em endereco (geocodificacao reversa) e grava o
 * resultado em `location`; as coordenadas em si nao sao guardadas.
 */
export interface GeoPointInput {
  latitude: number;
  longitude: number;
}
