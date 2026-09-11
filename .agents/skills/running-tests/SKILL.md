---
name: running-tests
description: >
  Detalhes de como a suite Vitest deste monorepo roda por baixo — reporter
  silencioso, resolucao dos workspaces @repo/*, o que o projeto mobile
  consegue testar, e como investigar uma falha alem da primeira. Use quando
  test:ai se comportar de um jeito inesperado, precisar filtrar por
  workspace/arquivo, ou precisar do erro completo de uma falha.
---

O comando do dia a dia (`npm run --silent test:ai`) e regra fixa, nao
conteudo desta skill — veja `AGENTS.md`.

## O que o reporter silencioso faz

`test:ai` usa `vitest.quiet.config.ts` (herda de `vitest.config.ts`, so troca
o reporter em `test/quiet-reporter.ts`):

- **Passou** — imprime exatamente `Tests pass`, sai com codigo 0.
- **Falhou** — imprime o primeiro teste quebrado (arquivo, cadeia
  `describe > teste`, erro, `expected`/`actual`, stack) e o total
  `N of M tests failed`, sai com codigo 1. A stack mostra so frames do
  projeto — os de `@vitest/runner`/`node:internal` sao iguais em todo erro e
  nao ajudam.

Nada mais e impresso: sem cabecalho, sem lista de arquivos, sem
`console.log` dos testes. O objetivo e cortar consumo de tokens.

## Resolucao e escopo

`vitest.workspace.ts` resolve `@repo/*` direto do fonte TypeScript, nao de
`dist/` — por isso `test:ai` nao precisa de build antes.

O projeto `mobile` roda em ambiente node e inclui so `*.test.ts`, sem
`.tsx`: renderizar componente de React Native exigiria o runtime nativo, que
nao existe no Vitest. So da para testar logica pura la.

Cuidado ao logar em codigo de producao rodado por teste: o `Logger` do Nest
escreve direto no stdout e escapa do `silent` do Vitest. Por isso o
`DomainExceptionFilter` recebe o logger pelo construtor, e os testes passam
um mudo (`apps/api/src/events/testing/status-of.ts`).

## Investigar uma falha alem da primeira

```bash
npm test                                                  # saida completa do Vitest
npm run --silent test:ai apps/api/src/caminho/do.test.ts  # so um arquivo
npx vitest run --project api                              # so um workspace
```

Workspaces: `web`, `mobile`, `api`, `auth`, `entities`, `persistence`,
`timeline`, `theme`.

## Auth contra Postgres real

Os testes do `auth` que exigem Postgres pulam sozinhos sem
`AUTH_TEST_DATABASE_URL` — e sao a maior parte da suite dele. Nesse caso
`Tests pass` pode significar que os arquivos de integracao nem rodaram. Para
roda-los de verdade, use a skill `auth-postgres-tests`.
