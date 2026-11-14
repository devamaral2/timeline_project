# 43: Barra de edição com IA no evento e no artefato

**What to build:** No detalhe de um evento ou de um artefato, o usuário pede uma edição ao agente pelo campo do rodapé, escrevendo ou falando, e vê a entidade mudar quando o pedido termina.

**Blocked by:** 06 (Cliente da API e API falsa: pedidos); 20 (Rota única de detalhe do evento); 34 (Detalhe do artefato)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 37 e 69, “Pedidos: chat, barra de edição e voz”. ADR 0006. Canvas: quadro Detalhe · leitura (rodapé).

- [ ] Enviar abre um pedido de edição com o tipo e o id da entidade aberta.
- [ ] O tipo enviado segue a entidade: evento; artefato de texto; e as variantes de alimento, sono, treino, skill e agente.
- [ ] A linha de status do campo mostra o andamento do pedido.
- [ ] Quando o pedido termina, o detalhe é recarregado e mostra a mudança.
- [ ] Um pedido que falha mostra a mensagem conforme o código do erro.
- [ ] O teste de tela cobre um evento e um artefato.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
