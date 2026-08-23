<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rodando os testes

Use **sempre** `npm run --silent test:ai`, nunca `npm test` nem `npx vitest`.
(`--silent` corta o cabecalho que o proprio npm imprime.)

Ele roda a suite inteira com `vitest.quiet.config.ts`, que herda tudo de
`vitest.config.ts` e so troca a saida (reporter em `src/test/quiet-reporter.ts`):

- **Passou** — imprime exatamente `Tests pass` e sai com codigo 0.
- **Falhou** — imprime o primeiro teste quebrado (arquivo, cadeia
  `describe > teste`, erro, `expected`/`actual` e a stack de chamadas) e o total
  `N of M tests failed`. Sai com codigo 1. A stack mostra so os frames do
  projeto: os frames de `@vitest/runner` e `node:internal` sao identicos em todo
  erro e nao ajudam.

Nada mais e impresso: sem cabecalho, sem lista de arquivos, sem os `console.log`
dos testes. O objetivo e cortar o consumo de tokens ao rodar testes.

Para investigar uma falha alem do primeiro erro, rode `npm test` (saida completa
do Vitest) ou filtre um arquivo: `npm run --silent test:ai src/caminho/do.test.ts`.
