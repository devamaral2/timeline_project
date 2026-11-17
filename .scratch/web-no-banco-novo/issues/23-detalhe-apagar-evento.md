# 23: Detalhe: apagar evento

**What to build:** O usuário apaga um evento pelo menu “Mais ações” do detalhe.

**Blocked by:** 20 (Rota única de detalhe do evento)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 38.

- [x] “Mais ações” oferece apagar, com confirmação.
- [x] Confirmar apaga o evento pela API e volta para a tela de onde o usuário veio.
- [x] Se o evento já não existe, a tela avisa e volta do mesmo jeito.
- [x] Em evento de agente a opção não aparece.
- [x] O teste de tela confere a chamada e a navegação.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
