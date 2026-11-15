# 41: Chat com o Hermes sobre pedidos

**What to build:** A conversa com o Hermes passa a abrir e acompanhar pedidos, com o rastro do que ele fez, e só aparece onde o Hermes está ligado.

**Blocked by:** 40 (Chat por passos sobre pedidos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 77, “Pedidos: chat, barra de edição e voz”.

- [x] Uma mensagem ao Hermes abre um pedido pela rota dele, com o id de mensagem estável e a sessão.
- [x] O chat acompanha o pedido e mostra a resposta e o rastro (pensamentos e ferramentas) na aba de processo.
- [x] Onde o Hermes está desligado, o chat descobre pela resposta de não encontrado e não oferece essa conversa.
- [x] Reenviar a mesma mensagem não manda uma segunda ao Hermes.
- [x] O teste de tela cobre o Hermes ligado e desligado.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
