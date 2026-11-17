# 28: Edição: bloqueios

**What to build:** No modo de edição, o usuário busca outro evento e o marca como bloqueador ou como bloqueado.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 21 (Detalhe: subtarefas e bloqueios)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 47. Canvas: quadro Detalhe · edição (Bloqueios). Glossário: Bloqueio.

- [x] Há uma busca de evento por nome em “Bloqueado por” e outra em “Bloqueia”.
- [x] O evento aberto não aparece no resultado da busca.
- [x] Cada bloqueio pode ser removido.
- [x] As mudanças vão no mesmo Salvar do formulário.
- [x] Se a API recusar por fechar ciclo, a tela mostra a mensagem e mantém o formulário.
  A mensagem é a geral de entrada recusada: o cliente da API descarta o corpo do erro, então o texto “ciclo” da API não chega à tela.
- [x] O teste de tela confere a busca e o corpo enviado.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
