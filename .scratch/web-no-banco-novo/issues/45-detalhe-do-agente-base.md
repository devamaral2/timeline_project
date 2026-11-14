# 45: Detalhe do evento de agente: Informações, Passos e Registro

**What to build:** Abrir um pedido ou uma execução agendada mostra o detalhe na forma do agente, com o status, o início, a conclusão e os passos.

**Blocked by:** 20 (Rota única de detalhe do evento); 06 (Cliente da API e API falsa: pedidos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 54, 56 e 62, “Detalhe do evento de agente”, e a tabela de lacunas em “Notas”. Canvas: quadro Detalhe · agente. Glossário: Pedido, Execução agendada, Passo.

- [ ] Um evento de agente abre na rota de detalhe com a forma do agente; os dados vêm do evento e do pedido com o mesmo id.
- [ ] O topo mostra o código do tipo, o título, o status do agente e “N de M passos”; não há lápis nem troca de status.
- [ ] “Informações” mostra o início, com o tempo decorrido, e a conclusão, ou “ainda não concluído”.
- [ ] “Passos” lista cada passo com o agente interno e o status; os passos não são clicáveis.
- [ ] “Registro” mostra a criação e a última alteração do pedido.
- [ ] “Fim estimado” e “Job” não aparecem: o contrato não traz esses dados.
- [ ] Com o pedido em aberto, o detalhe se recarrega em intervalo até o estado final.
- [ ] O teste de tela usa a API falsa e avança o pedido.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
