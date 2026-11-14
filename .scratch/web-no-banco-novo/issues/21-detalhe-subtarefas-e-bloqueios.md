# 21: Detalhe: subtarefas e bloqueios

**What to build:** O detalhe do evento mostra as subtarefas, com o status de cada uma trocável, e os bloqueios nos dois sentidos.

**Blocked by:** 20 (Rota única de detalhe do evento); 10 (Linha única das listas)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 32 e 33. Canvas: quadro Detalhe · leitura (Subtarefas e Bloqueios). Glossário: Subtarefa, Bloqueio.

- [ ] A seção Subtarefas lista os eventos em que o evento se desdobra, com a linha única, e mostra a fração feita (“1/3”).
- [ ] O status de cada subtarefa se troca na própria lista, com a revisão da subtarefa.
- [ ] A seção Bloqueios mostra “Bloqueado por” e “Bloqueia”, cada evento com nome, tipo e quando.
- [ ] Sem bloqueio num sentido, a seção diz “nenhum evento”.
- [ ] Tocar numa subtarefa ou num evento de bloqueio abre o detalhe dele.
- [ ] O teste de tela cobre um evento com subtarefas e com bloqueios nos dois sentidos.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
