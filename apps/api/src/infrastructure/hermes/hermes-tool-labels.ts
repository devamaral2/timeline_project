const EXACT_LABELS: Record<string, string> = {
  terminal: "Executou um comando",
  shell: "Executou um comando",
  run_command: "Executou um comando",
  execute_code: "Executou código",
  read_file: "Leu um arquivo",
  write_file: "Escreveu um arquivo",
  patch: "Editou um arquivo",
  search_files: "Buscou nos arquivos",
  web_search: "Pesquisou na web",
  web_extract: "Leu uma página",
  browser: "Navegou na web",
  skill_view: "Carregou uma skill",
  skills_list: "Listou as skills",
  memory: "Consultou a memória",
  delegate_task: "Delegou um trabalho",
};

const MCP_LABELS: Record<string, string> = {
  create_event: "Criou um evento",
  create_artifact: "Criou um artefato",
  create_recurrence: "Criou uma recorrência",
  update_event: "Editou um evento",
  update_artifact: "Editou um artefato",
  update_recurrence: "Editou uma recorrência",
  get_event: "Leu um evento",
  get_artifact: "Leu um artefato",
  get_recurrence: "Leu uma recorrência",
  list_timeline_events: "Listou a agenda",
  list_tracked_events: "Listou os eventos acompanhados",
  list_artifacts: "Listou os artefatos",
  list_recurrences: "Listou as recorrências",
};

/** O nome de uma ferramenta vira um rotulo legivel; as do MCP da agenda (`mcp_braid_*`) ficam em portugues. */
export function toolLabel(tool: string): string {
  const exact = EXACT_LABELS[tool];
  if (exact) return exact;
  const mcp = /^mcp_braid_(.+)$/.exec(tool)?.[1];
  if (mcp && MCP_LABELS[mcp]) return MCP_LABELS[mcp];
  return `Usou ${tool.replace(/_/g, " ")}`;
}
