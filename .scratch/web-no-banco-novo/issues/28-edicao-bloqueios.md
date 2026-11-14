# 28: Edição: bloqueios

**What to build:** No modo de edição, o usuário busca outro evento e o marca como bloqueador ou como bloqueado.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 21 (Detalhe: subtarefas e bloqueios)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 47. Canvas: quadro Detalhe · edição (Bloqueios). Glossário: Bloqueio.

- [ ] Há uma busca de evento por nome em “Bloqueado por” e outra em “Bloqueia”.
- [ ] O evento aberto não aparece no resultado da busca.
- [ ] Cada bloqueio pode ser removido.
- [ ] As mudanças vão no mesmo Salvar do formulário.
- [ ] Se a API recusar por fechar ciclo, a tela mostra a mensagem e mantém o formulário.
- [ ] O teste de tela confere a busca e o corpo enviado.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
