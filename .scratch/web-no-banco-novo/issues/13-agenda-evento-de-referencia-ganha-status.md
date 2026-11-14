# 13: Agenda: evento de referência ganha status

**What to build:** Na agenda, tocar no ponto azul de um evento de referência abre a escolha de status. Escolher um status passa a acompanhar o evento.

**Blocked by:** 11 (Agenda lê a API nova)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 26, “Agenda”. Canvas: quadro Status. Glossário: Evento de referência.

- [ ] O toque no ponto azul abre a escolha com os sete status de pessoa.
- [ ] Escolher um status edita o evento com a revisão lida, e a linha passa a mostrar o glifo novo.
- [ ] Diante de revisão desatualizada, a tela avisa e recarrega a agenda.
- [ ] O teste de tela confere a edição enviada e a linha depois dela.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
