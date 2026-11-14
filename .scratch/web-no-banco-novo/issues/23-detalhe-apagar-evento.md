# 23: Detalhe: apagar evento

**What to build:** O usuário apaga um evento pelo menu “Mais ações” do detalhe.

**Blocked by:** 20 (Rota única de detalhe do evento)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 38.

- [ ] “Mais ações” oferece apagar, com confirmação.
- [ ] Confirmar apaga o evento pela API e volta para a tela de onde o usuário veio.
- [ ] Se o evento já não existe, a tela avisa e volta do mesmo jeito.
- [ ] Em evento de agente a opção não aparece.
- [ ] O teste de tela confere a chamada e a navegação.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
