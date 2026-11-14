# 46: Detalhe do evento de agente: Entradas, Produziu e Sessão

**What to build:** O detalhe do evento de agente mostra as entradas em ordem, o que o pedido produziu e de qual pedido ele continua.

**Blocked by:** 45 (Detalhe do evento de agente: Informações, Passos e Registro)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 55, 57 e 58, “Detalhe do evento de agente”. Canvas: quadro Detalhe · agente. Glossário: Entrada, Sessão.

- [ ] “Entradas” lista as entradas do rastro do pedido em ordem, cada uma com o tipo, a hora e o texto.
- [ ] “Produziu” lista os eventos e os artefatos que o pedido criou, alterou ou apagou; tocar num que ainda existe abre o detalhe dele.
- [ ] “Sessão” mostra “Continua de”, com o primeiro pedido, quando o pedido aberto é uma continuação.
- [ ] “Continuações” não aparece: a API não tem consulta para elas.
- [ ] Seção sem conteúdo não aparece.
- [ ] O teste de tela cobre um pedido com entradas, entidades e sessão.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
