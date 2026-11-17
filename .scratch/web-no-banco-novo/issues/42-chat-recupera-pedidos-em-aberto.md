# 42: Chat recupera pedidos em aberto

**What to build:** Ao recarregar a página, o chat reencontra os pedidos que ainda rodavam e mostra o resultado quando terminam.

**Blocked by:** 40 (Chat por passos sobre pedidos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 75, “Pedidos: chat, barra de edição e voz”.

- [x] Ao abrir, o chat lê a lista de pedidos e volta a acompanhar os que estão na fila, executando ou aguardando.
- [x] Quando um pedido recuperado termina, a resposta aparece no chat.
- [x] Um pedido que já terminou não é reaberto sozinho.
- [x] O teste de tela simula o recarregamento com um pedido em andamento.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
