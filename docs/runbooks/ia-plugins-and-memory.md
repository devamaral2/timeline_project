# MCPs, plugins e ai-memory

Os manifestos em `.ia/mcp/` e `.ia/plugins/` são contratos sem autenticação.
Linear, Gmail, GitHub e ai-memory recebem credenciais pelo ambiente do agente
ou por um gerenciador externo.

O wrapper `scripts/ia/ai-memory-hook.sh` recebe um evento, resolve o binário,
data-dir e URL por variáveis de ambiente e falha aberto se o serviço não
estiver disponível. Isso preserva o fluxo de desenvolvimento, mas deve ser
observado para não esconder uma perda de memória.

Variáveis aceitas:

- `AI_MEMORY_BIN`;
- `AI_MEMORY_DATA_DIR`;
- `AI_MEMORY_SERVER_URL`;
- `AI_AGENT_NAME`.

Não copie `~/.codex/config.toml`, `~/.codex/hooks.json`, tokens ou perfis para o
repositório. A configuração do agente continua sendo um adaptador local.
