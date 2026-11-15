# 44: Voz vira pedido

**What to build:** O botão de voz e a fila de falas passam a abrir e acompanhar pedidos de voz. Hoje o botão não está montado em nenhuma tela, e este ticket não o monta: ele porta o componente e a fila.

**Blocked by:** 06 (Cliente da API e API falsa: pedidos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 76, “Pedidos: chat, barra de edição e voz”.

- [x] O botão de voz envia a transcrição como um pedido de voz, com um id de mensagem estável.
- [x] A fila acompanha o pedido; quando ele termina, o evento criado é lido das entidades do pedido e entregue a quem usa o botão.
- [x] Um pedido de voz que falha mostra a mensagem de falha.
- [x] A fila de falas pendentes continua funcionando como hoje, inclusive depois de recarregar a página.
- [x] Os testes do botão de voz e da fila passam com o formato novo.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
