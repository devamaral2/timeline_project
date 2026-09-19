# Infraestrutura compartilhada de IA

`.ia/` é a fonte canônica versionada para os artefatos que podem ser
compartilhados entre agentes, o checkout local e a VPS.

## O que entra aqui

- contratos e skills próprios do repositório;
- hooks portáveis, sem caminhos absolutos ou segredos;
- exemplos sanitizados de MCPs e plugins;
- wrappers reproduzíveis para worktrees;
- scripts de instalação, validação e diagnóstico;
- documentação específica da infraestrutura de IA.

## O que não entra aqui

Tokens, cookies, perfis de navegador, chaves SSH, arquivos `.env`, bancos,
volumes, caches, logs, worktrees ativas e artefatos de execução ficam fora do
Git. O `.gitignore` reserva diretórios locais para esses dados, mas eles não
devem ser usados como armazenamento permanente.

## Descoberta e precedência

1. Leia [`manifest.yaml`](./manifest.yaml) para saber quais componentes fazem
   parte do contrato.
2. O adaptador do agente (a ser implementado na RAF-114) traduz o contrato para
   o formato esperado pelo ambiente.
3. Valores locais são injetados por ambiente ou gerenciador de segredos.
4. Uma definição local não substitui silenciosamente um componente canônico.

Enquanto os adaptadores não forem implementados, esta pasta é declarativa e não
é carregada automaticamente pelo Codex, Claude ou pela VPS.

## Convenções

- nomes de componentes e arquivos em `kebab-case`;
- exemplos terminam em `.example.*` e nunca contêm valores reais;
- mudanças incompatíveis incrementam `schemaVersion` no manifesto;
- cada componente documenta dono, entradas, saídas e como validar;
- scripts futuros devem oferecer `check` antes de `apply` e `remove`.

## Componentes

- [`skills/`](./skills/) — skills próprias deste repositório;
- [`hooks/`](./hooks/) — eventos e wrappers de ciclo de vida;
- [`mcp/`](./mcp/) — contratos e exemplos de servidores MCP;
- [`plugins/`](./plugins/) — integrações e permissões mínimas;
- [`worktrees/`](./worktrees/) — convenções sem armazenar worktrees;
- [`scripts/`](./scripts/) — automação segura e idempotente;
- [`docs/`](./docs/) — notas operacionais da camada `.ia/`.
