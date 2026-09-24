# Infraestrutura compartilhada de IA

`.agents/` é a fonte canônica versionada para os artefatos que podem ser
compartilhados entre agentes, o checkout local e a VPS.

## O que entra aqui

- contratos e skills próprios do repositório;
- hooks portáveis, sem caminhos absolutos ou segredos;
- exemplos sanitizados de MCPs e plugins;
- scripts de validação e diagnóstico;
- o runner de navegador headless usado em smoke tests.

A documentação do projeto — inclusive a desta camada — fica em
[`docs/`](../docs/), com os runbooks em [`docs/runbook/`](../docs/runbook/).

## O que não entra aqui

Tokens, cookies, perfis de navegador, chaves SSH, arquivos `.env`, bancos,
volumes, caches, logs, worktrees ativas e artefatos de execução ficam fora do
Git. O `.gitignore` reserva `.agents/local/`, `.agents/runtime/` e afins para
esses dados, mas eles não devem ser usados como armazenamento permanente.

## Descoberta e precedência

1. Leia [`manifest.yaml`](./manifest.yaml) para saber quais componentes fazem
   parte do contrato.
2. O Codex e o Claude descobrem as skills diretamente em `skills/`; os demais
   componentes são carregados explicitamente ou servem só como documentação.
3. Valores locais são injetados por ambiente ou pelo 1Password.
4. Uma definição local não substitui silenciosamente um componente canônico.

## Convenções

- nomes de componentes e arquivos em `kebab-case`;
- exemplos terminam em `.example.*` e nunca contêm valores reais;
- mudanças incompatíveis incrementam `schemaVersion` no manifesto;
- valide tudo com `pnpm agents:validate`.

## Componentes

- [`skills/`](./skills/) — skills próprias deste repositório;
- [`hooks/`](./hooks/) — eventos e wrappers de ciclo de vida;
- [`mcp/`](./mcp/) — contratos e exemplos de servidores MCP;
- [`plugins/`](./plugins/) — integrações e permissões mínimas;
- [`browser/`](./browser/) — runner Playwright efêmero para smoke tests;
- [`environments/`](./environments/) — ambientes locais de apoio;
- [`adapters/`](./adapters/) — como cada agente consome este contrato;
- [`scripts/`](./scripts/) — automação segura e idempotente.
