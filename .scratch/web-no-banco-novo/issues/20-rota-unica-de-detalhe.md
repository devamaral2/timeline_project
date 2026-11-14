# 20: Rota única de detalhe do evento

**What to build:** Um evento aberto pela agenda ou pela lista de tarefas cai na mesma tela de detalhe, em modo de leitura, com o topo, a seção Informações e o que a API entrega.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags); 09 (Glifos de status e ícones de tipo)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 28 a 31, “Detalhe e formulário do evento”, e a tabela de lacunas em “Notas”. Canvas: quadro Detalhe · leitura.

- [ ] Há uma só rota de detalhe de evento; o endereço antigo de detalhe de tarefa redireciona para ela.
- [ ] O cabeçalho mostra “Evento” no centro, o botão de voltar, o lápis e “Mais ações”.
- [ ] O topo mostra o código do tipo, o título, o status e a prioridade; status e prioridade se trocam ali mesmo, com a revisão lida.
- [ ] A seção “Informações” mostra em texto: início, fim planejado com a duração, tarefa persistente, recorrência (a regra e se a ocorrência segue a série), “Lembrar antes de” em cartões pequenos, tags e descrição.
- [ ] O fim planejado aparece em uma linha só: “Término” no evento comum e “Previsão de entrega” no evento longo.
- [ ] Localização, horário padrão, “Gerado por” e Registro não aparecem: o contrato do evento não traz esses dados.
- [ ] Um evento de agente aberto nesta rota mostra o topo e as Informações só em leitura, até o ticket do detalhe de agente.
- [ ] Evento inexistente mostra a tela de não encontrado.
- [ ] O teste de tela usa a API falsa e cobre a leitura e a troca de status.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
