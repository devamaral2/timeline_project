# 27: Edição: subtarefas

**What to build:** No modo de edição, o usuário cria, renomeia e remove subtarefas do evento.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 21 (Detalhe: subtarefas e bloqueios)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 46. Canvas: quadro Detalhe · edição (Subtarefas). Glossário: Subtarefa.

- [x] “Nova subtarefa” acrescenta uma linha com nome editável.
- [x] Ao Salvar, cada subtarefa nova vira um evento ligado ao evento aberto como subtarefa dele.
- [x] Renomear uma subtarefa existente edita o nome dela, com a revisão dela.
- [x] Remover desfaz a ligação; o evento da subtarefa não é apagado.
- [x] Descartar não cria, renomeia nem remove nada.
- [x] O teste de tela confere as chamadas de cada caso.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
