# 40: Chat por passos sobre pedidos

**What to build:** O usuário manda um pedido pelo chat e vê os passos, o que foi criado ou alterado e a resposta. A tela do chat não muda; muda o que há por baixo dela.

**Blocked by:** 06 (Cliente da API e API falsa: pedidos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 72 a 74, “Pedidos: chat, barra de edição e voz”. Glossário: Pedido, Passo, Sessão.

- [x] Enviar uma mensagem abre um pedido, com o texto, o contexto da tela e um id de mensagem estável.
- [x] O chat acompanha o pedido até o estado final e mostra a caixa de passos, as entidades tocadas e a resposta.
- [x] A mensagem seguinte manda o id do primeiro pedido como sessão.
- [x] Reenviar a mesma mensagem depois de uma falha de rede não abre um segundo pedido.
- [x] Um pedido que falha mostra a mensagem conforme o código do erro.
- [x] Cancelar pelo chat cancela o pedido pela API.
- [x] A aparência do chat não muda. Única adição: o botão “Cancelar pedido” dentro da caixa de processo, enquanto o pedido está aberto (exigido pelo critério de cancelar).
- [x] O teste de tela usa a API falsa, avança o pedido e confere o que aparece.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
