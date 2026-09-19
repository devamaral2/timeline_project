# Inventário da infraestrutura existente de agentes e IA

> Inventário inicial da RAF-111. Snapshot local: 2026-09-18. Nenhum segredo ou
> conteúdo de credencial foi copiado para este documento.

## Resumo

Hoje existem quatro fontes relevantes: configuração global do Codex, hooks
globais do ai-memory, configuração local do repositório e scripts/documentação
de worktree/VPS. Ainda não existe uma fonte `.ia/` no repositório.

## Itens versionados no repositório

| Origem | Conteúdo atual | Destino canônico | Sensibilidade / ação |
| --- | --- | --- | --- |
| `.agents/skills/` | Skills operacionais do monorepo: testes, migrations, env, worktrees, refactors e Caveman | `.ia/skills/` com adaptadores `.agents/skills/` | Versionável; migrar sem copiar estado |
| `skills/frontend-design/` | Skill de design e manifesto `agents/openai.yaml` | `.ia/skills/frontend-design/` | Versionável; preservar licença |
| `.claude/launch.json` | Comandos locais de web/auth com portas fixas | `.ia/adapters/claude/` ou documentação local | Adaptador; revisar portas antes de levar para VPS |
| `.claude/settings.json` | Permissões e allowlist específicas do checkout | `.ia/adapters/claude/` como template | Não copiar permissões cegamente; validar comandos |
| `scripts/worktree/` | Criação, provisionamento, portas e teardown de worktrees | `.ia/worktrees/` + wrapper compatível | Código versionável; não incluir `.worktrees/` nem `.env.local` |
| `docs/runbooks/worktrees.md` | Operação de worktrees e isolamento de Postgres | `.ia/docs/` com link no runbook público | Versionável; manter instruções do monorepo |
| `infra/docker-compose.local.yml` | Dependências locais de desenvolvimento | Referência de ambiente, não configuração de agente | Versionável; não misturar com runtime da VPS |
| `package.json` | Scripts `worktree:*`, `env:pull`, build/dev/test | Manifesto/runner da aplicação | Versionável; `env:pull` continua dependendo de segredo externo |
| `AGENTS.md` | Regras canônicas do monorepo e roteamento de skills | Continua na raiz; `.ia/` só referencia | Fonte de regras do código, não duplicar em skills |

## Itens globais fora do repositório

| Origem | Constatação | Destino canônico | Ação |
| --- | --- | --- | --- |
| `~/.codex/config.toml` | Modelo, plugins, marketplaces, MCPs `node_repl`, `obsidian` e `ai-memory`, projetos confiáveis | `.ia/mcp/` e `.ia/plugins/` como manifestos declarativos | Exportar somente nomes, contratos e placeholders; manter caminhos/URLs locais no adaptador |
| `~/.codex/hooks.json` | Hooks `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop` e `SessionEnd` chamando ai-memory | `.ia/hooks/` com wrapper configurável | Versionar eventos e contrato; injetar binário, data-dir e URL por ambiente |
| `~/.codex/skills/grill-me/` | Skill global instalada | `.ia/skills/` somente se for parte do fluxo deste repositório | Confirmar propriedade/licença antes de copiar |
| `~/.agents/skills/` | Skills externas do ambiente, incluindo `computer-use`, `orchestration` e `find-skills` | Não importar automaticamente | Usar como dependências documentadas ou instalar pelo gerenciador do agente |
| `~/.claude/` | Credenciais, caches, histórico e estado de outro agente | Nunca | Não inventariar conteúdo; apenas registrar que é estado privado |

## Integrações mencionadas no plano

| Integração | Estado observado | Tratamento |
| --- | --- | --- |
| ai-memory | MCP local em `127.0.0.1`, hooks globais e data-dir fora do Git | Declarar contrato e eventos; credenciais/estado ficam na máquina |
| Linear | Plugin/conector disponível no ambiente atual | Manifestar permissões mínimas; autenticação nunca no Git |
| Gmail | Desejado no plano, sem configuração versionada encontrada | Registrar como integração pendente; não criar arquivo fictício |
| GitHub | Repositório e documentação de deploy existentes; segredos de VPS explicitamente fora do Git | Documentar escopo e secrets externos |
| Playwright/headless browser | Dependência aparece no lockfile e há necessidade de uso remoto; nenhum serviço compartilhado encontrado | Implementar depois, na RAF-116 |

## Duplicidades e conflitos

1. Skills existem em escopo global e no repositório; a versão local do contrato
   deve vencer apenas quando o repositório declarar explicitamente a skill.
2. Hooks globais dependem de caminhos absolutos (`/home/...`) e não são
   portáveis para a VPS sem um adaptador.
3. `.claude/launch.json` usa portas fixas, enquanto os scripts de worktree
   calculam portas livres; esses modelos não devem ser mesclados silenciosamente.
4. A configuração global inclui MCPs de uso pessoal (`obsidian`) que não devem
   entrar no contrato deste repositório por padrão.
5. A documentação `vpn/` descreve infraestrutura de produção/staging; ela é
   referência operacional, não deve virar configuração de agente.

## Itens não encontrados

- pasta `.ia/`;
- manifesto versionado de MCPs/plugins;
- serviço remoto de navegador headless;
- configuração versionada de Gmail;
- credenciais ou cookies que possam ser migrados com segurança.

## Próximos destinos

- RAF-112: criar `.ia/`, manifesto, exclusões e templates sanitizados;
- RAF-114: criar adaptadores para Codex, agentes e este checkout;
- RAF-115/119: configurar MCPs, plugins, ai-memory e hooks;
- RAF-116: disponibilizar Playwright remoto;
- RAF-113/117: preparar a VPS e os ambientes isolados.
