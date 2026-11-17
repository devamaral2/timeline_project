# 39: Arquivo do agente: pedido de edição

**What to build:** O dono pede ao Hermes uma edição num arquivo de skill ou de agente e acompanha o pedido até o fim.

**Blocked by:** 37 (Arquivo do agente: texto atual); 06 (Cliente da API e API falsa: pedidos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 80. ADR 0005.

- [x] O detalhe do arquivo tem o campo do agente; enviar abre um pedido de edição do arquivo.
- [x] A tela acompanha o pedido até o estado final e mostra a resposta.
- [x] Quando o pedido termina, o texto do arquivo é recarregado.
- [x] Com o Hermes desligado, o campo não aparece.
  Limite: a API não tem rota que diga se o Hermes está ligado, então o campo aparece para o dono e some depois do primeiro envio que responde 404 (com a mensagem "O Hermes está desligado neste servidor.").
- [x] O teste de tela cobre o envio, o acompanhamento e o Hermes desligado.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
