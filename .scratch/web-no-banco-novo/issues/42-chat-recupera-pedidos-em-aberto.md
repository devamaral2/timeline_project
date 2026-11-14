# 42: Chat recupera pedidos em aberto

**What to build:** Ao recarregar a página, o chat reencontra os pedidos que ainda rodavam e mostra o resultado quando terminam.

**Blocked by:** 40 (Chat por passos sobre pedidos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 75, “Pedidos: chat, barra de edição e voz”.

- [ ] Ao abrir, o chat lê a lista de pedidos e volta a acompanhar os que estão na fila, executando ou aguardando.
- [ ] Quando um pedido recuperado termina, a resposta aparece no chat.
- [ ] Um pedido já terminado, sem registro local de que o usuário o esperava, não é reaberto sozinho.
- [ ] O teste de tela simula o recarregamento com um pedido em andamento.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
