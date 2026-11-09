/** Nota que aponta para um arquivo de skill ou agente do Hermes (ADR 0005). Nunca o conteudo. */
export interface AgentFileNote {
  /** Caminho relativo a pasta de arquivos, com `/` (ex.: `hermes/skills/x/SKILL.md`). */
  path: string;
  /** SHA-256 do texto lido por ultimo. */
  hash: string;
  /** O arquivo sumiu da pasta. */
  missing: boolean;
  /** O `description` do cabecalho (frontmatter) do arquivo; sem ele, ausente. */
  description?: string;
}
