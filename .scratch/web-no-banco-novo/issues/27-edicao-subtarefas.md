# 27: Edição: subtarefas

**What to build:** No modo de edição, o usuário cria, renomeia e remove subtarefas do evento.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 21 (Detalhe: subtarefas e bloqueios)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 46. Canvas: quadro Detalhe · edição (Subtarefas). Glossário: Subtarefa.

- [ ] “Nova subtarefa” acrescenta uma linha com nome editável.
- [ ] Ao Salvar, cada subtarefa nova vira um evento ligado ao evento aberto como subtarefa dele.
- [ ] Renomear uma subtarefa existente edita o nome dela, com a revisão dela.
- [ ] Remover desfaz a ligação; o evento da subtarefa não é apagado.
- [ ] Descartar não cria, renomeia nem remove nada.
- [ ] O teste de tela confere as chamadas de cada caso.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
