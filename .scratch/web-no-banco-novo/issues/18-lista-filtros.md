# 18: Lista de tarefas: filtros

**What to build:** A lista de tarefas pode ser filtrada por tag, por prioridade e por texto.

**Blocked by:** 15 (Lista de tarefas lê a API nova, em seis grupos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 15. Rota `GET /api/events/tracked` no Swagger.

- [x] Os filtros vão como parâmetros da consulta à API (`tag`, `priority`, `q`), e não como filtro só na tela.
- [x] A prioridade aceita mais de um nível ao mesmo tempo.
- [x] Limpar os filtros volta à lista inteira.
- [x] Com filtro ativo e nada encontrado, a tela diz que nenhum evento passou no filtro.
- [x] O teste de tela confere os parâmetros enviados.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
