# Arquitetura da infraestrutura compartilhada de IA

> Decisão da RAF-110 revisada para a integração local: `.agents/` é a fonte
> canônica e o caminho de descoberta do Codex.

## Objetivo

Manter uma única fonte versionada para os artefatos que ensinam, conectam e
validam os agentes neste repositório. Codex e outros agentes consomem o mesmo
contrato local sem copiar credenciais, estado ou regras.

## Regra de propriedade

| Camada | Fonte de verdade | Pode entrar no Git? | Exemplos |
| --- | --- | --- | --- |
| Contrato compartilhado | `.agents/` no repositório | Sim | skills, hooks, manifestos MCP, plugins, scripts e runbooks |
| Descoberta do Codex | `.agents/skills/` | Sim | `SKILL.md` e `agents/openai.yaml` por skill |
| Runtime local | diretórios ignorados do checkout | Não | caches, sessões, worktrees ativas, logs, perfis e artefatos |
| Segredo | ambiente/gerenciador externo | Não | tokens, cookies, chaves, senhas e URLs privadas |

`.agents/skills` é a implementação canônica. Não há link, cópia ou diretório
paralelo para skills.

## Estrutura canônica

```text
.agents/
├── README.md
├── manifest.yaml
├── skills/                    # implementação das skills do projeto
├── hooks/                     # eventos e contratos de ciclo de vida
├── mcp/                       # contratos e exemplos sanitizados
├── plugins/                   # permissões e exemplos de integrações
├── browser/                   # runner local descartável do Playwright
├── environments/local/        # dependências efêmeras locais
├── adapters/                  # limites dos loaders, sem estado privado
├── worktrees/                 # convenções, não instâncias
├── scripts/                   # validação e hooks executáveis
└── docs/                      # notas específicas da camada de IA
```

A implementação operacional, os contratos e a documentação específica vivem
em `.agents/`.

## Contratos e precedência

1. O repositório define o contrato em `.agents/`.
2. O Codex descobre diretamente `.agents/skills/*/SKILL.md` e seus metadados.
3. Configuração local pode fornecer somente caminhos, permissões e valores de
   ambiente; não pode substituir silenciosamente skills ou hooks canônicos.
4. Segredos e estado nunca são resolvidos de arquivos versionados.
5. `check`, `apply` e `remove` são idempotentes e recusam sobrescrever uma
   instalação que não seja um link conhecido.

Conflito entre uma definição local e a canônica é erro explícito.

## Limites

Não são unificados:

- tokens, cookies, perfis de navegador, sessões e histórico;
- chaves SSH, arquivos `.env*`, bases, volumes e caches;
- logs e artefatos de execução do Playwright;
- estado de worktrees e portas atribuídas dinamicamente;
- configurações privadas de Codex, Claude ou de outro agente sem formato
  público estável;
- serviços remotos, VPS e bootstrap de hosts.

Esses itens podem ter contrato de provisionamento ou exemplo sanitizado, mas
pertencem ao ambiente que executa a integração.

## Segurança e ciclo de vida

- O `.gitignore` e o `.dockerignore` cobrem estado, credenciais e artefatos.
- Exemplos usam placeholders; valores reais entram pelo ambiente no último
  momento.
- Hooks falham de modo não destrutivo quando o serviço de memória está
  indisponível.
- O runner Playwright cria contexto novo a cada execução e não mantém perfil.
- O ambiente local efêmero usa portas/volumes próprios e tem teardown explícito.
- Toda alteração da fonte canônica é validada por `.agents/scripts/validate.sh`.
