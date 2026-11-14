# 39: Arquivo do agente: pedido de edição

**What to build:** O dono pede ao Hermes uma edição num arquivo de skill ou de agente e acompanha o pedido até o fim.

**Blocked by:** 37 (Arquivo do agente: texto atual); 06 (Cliente da API e API falsa: pedidos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 80. ADR 0005.

- [ ] O detalhe do arquivo tem o campo do agente; enviar abre um pedido de edição do arquivo.
- [ ] A tela acompanha o pedido até o estado final e mostra a resposta.
- [ ] Quando o pedido termina, o texto do arquivo é recarregado.
- [ ] Com o Hermes desligado, o campo não aparece.
- [ ] O teste de tela cobre o envio, o acompanhamento e o Hermes desligado.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
