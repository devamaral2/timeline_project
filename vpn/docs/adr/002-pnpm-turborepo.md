# ADR-002 — pnpm workspaces + Turborepo

**Status:** aceita · **Data:** 2026-08-25

## Contexto

O projeto terá várias aplicações Node compartilhando tipos, configuração de
TypeScript/ESLint e provavelmente clientes de banco. É preciso decidir a estratégia de
repositório e a ferramenta de build.

## Decisão

**Monorepo** com **pnpm workspaces** para dependências e **Turborepo** para orquestração
e cache de tarefas.

## Alternativas consideradas

### Repositório

**Polirepo (um repositório por app).** Isolamento claro e deploys independentes. O custo é
o código compartilhado: cada mudança em algo comum vira publicar pacote no npm, bump de
versão em N lugares e sincronização manual. Com uma pessoa mantendo tudo, o atrito é
desproporcional.

### Gerenciador de pacotes

**npm workspaces.** Já vem instalado, sem dependência extra. Usa `node_modules` achatado,
o que permite importar dependências transitivas por acidente — código que funciona hoje e
quebra quando alguém atualiza outra coisa. Instalação mais lenta e mais disco.

**yarn (berry).** Plug'n'Play elimina `node_modules` e é rápido, mas quebra compatibilidade
com ferramentas que assumem a estrutura tradicional. Configuração adicional frequente.

**Bun.** Instalação extremamente rápida e runtime incluso. Ecossistema ainda amadurecendo
para produção; menos previsível sob carga e com menos material de referência.

**pnpm (escolhido).** Armazenamento global com hard links: uma versão de pacote baixada
uma vez, reusada em todos os projetos. Estrutura estrita — só se importa o que foi
declarado. O comando `pnpm deploy` resolve o problema de containerizar workspace, que é
central na [Fase 4](../06-fase-4-imagens-docker.md).

### Orquestrador de tarefas

**Nx.** Mais poderoso: geradores de código, grafo visual, plugins por framework, análise
de projetos afetados. Também mais opinativo e com curva maior. Para 2–5 pacotes, é
ferramenta demais.

**Lerna.** Foi o padrão histórico; hoje é mantido pela Nrwl e essencialmente um wrapper
de Nx. Sem motivo para escolher diretamente.

**Scripts npm + `--filter` do pnpm.** Funciona para começar e não tem dependência extra.
Perde o cache por hash de conteúdo, que é o principal ganho no CI.

**Turborepo (escolhido).** Faz duas coisas bem: resolve o grafo de dependências entre
tarefas e cacheia resultados por hash. Configuração cabe em 20 linhas. Integra com o cache
do GitHub Actions.

## Consequências

**Positivas.** Código compartilhado por import direto, sem publicação. Um `pnpm install`
para tudo. Cache faz o CI rodar em segundos quando nada relevante mudou. Uma configuração
de lint/TS para todos os pacotes.

**Negativas.** Symlinks do pnpm exigem cuidado especial no Docker — resolvido com
`pnpm deploy`, mas é uma armadilha real. O campo `outputs` do `turbo.json` mal configurado
causa bugs intermitentes e confusos. Um monorepo grande deixa o `git clone` e o CI mais
pesados. Ferramentas menos comuns podem não entender a estrutura.

## Quando revisitar

- Acima de **20 pacotes** ou com times distintos: avalie Nx
- Se o repositório passar de ~1GB: considere separar
- Se apenas uma aplicação existir por muito tempo: o monorepo é overhead sem retorno
