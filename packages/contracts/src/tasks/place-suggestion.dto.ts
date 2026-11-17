/** Um local achado na busca: `label` e o texto que a tarefa guarda e o Google Maps entende. */
export interface PlaceSuggestionDto {
  /** O nome do lugar ou, sem nome, o endereco curto. */
  name: string;
  /** O resto do endereco: rua, bairro e cidade. Pode ser vazio. */
  address: string;
  /** `name` e `address` juntos: o que vai para o campo `location` da tarefa. */
  label: string;
}
