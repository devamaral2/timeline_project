# 41: Chat com o Hermes sobre pedidos

**What to build:** A conversa com o Hermes passa a abrir e acompanhar pedidos, com o rastro do que ele fez, e só aparece onde o Hermes está ligado.

**Blocked by:** 40 (Chat por passos sobre pedidos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 77, “Pedidos: chat, barra de edição e voz”.

- [ ] Uma mensagem ao Hermes abre um pedido pela rota dele, com o id de mensagem estável e a sessão.
- [ ] O chat acompanha o pedido e mostra a resposta e o rastro (pensamentos e ferramentas) na aba de processo.
- [ ] Onde o Hermes está desligado, o chat descobre pela resposta de não encontrado e não oferece essa conversa.
- [ ] Reenviar a mesma mensagem não manda uma segunda ao Hermes.
- [ ] O teste de tela cobre o Hermes ligado e desligado.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
