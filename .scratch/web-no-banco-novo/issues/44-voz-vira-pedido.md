# 44: Voz vira pedido

**What to build:** O usuário fala um evento, e ele aparece na agenda quando o pedido termina.

**Blocked by:** 06 (Cliente da API e API falsa: pedidos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 76, “Pedidos: chat, barra de edição e voz”.

- [ ] O botão de voz envia a transcrição como um pedido de voz, com um id de mensagem estável.
- [ ] A tela acompanha o pedido; quando ele termina, o evento criado é lido das entidades do pedido e a agenda o mostra.
- [ ] Um pedido de voz que falha mostra a mensagem de falha.
- [ ] A fila de falas pendentes continua funcionando como hoje, inclusive depois de recarregar a página.
- [ ] Os testes do botão de voz e da fila passam com o formato novo.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
