# 09: Detalhe da tarefa de pessoa

**What to build:** Tocar numa tarefa de pessoa na Agenda ou em Tarefas abre o detalhe: topo com tipo, título, status e prioridade editáveis ali mesmo, Informações completas, tarefa principal e subtarefas como links, "Criado por" e "Atualizado por", e "Mais ações" com Excluir. Documentos da tarefa ficam para o ticket 16; Editar, para o 13.

**Blocked by:** 04

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: a rota de detalhe da tarefa, a vista da tarefa de pessoa, a seção de hierarquia, a formatação do detalhe e o diálogo de excluir.

- [ ] O detalhe lê `GET /api/tasks/{id}`; o mesmo destino de navegação mostra esta vista para pessoa e deixa a de agente para o ticket 10.
- [ ] Status e prioridade mudam no topo com a `revision` lida (com `finishedAt` como no ticket 04); a tarefa de referência não mostra status nem prioridade no topo.
- [ ] Informações: início, fim planejado e duração (prazo e "atrasada" na tarefa longa), recorrência, local, lembretes, tags e descrição, com a formatação portada e conferida contra fixtures do TS.
- [ ] Tocar no local abre o mapa do Android por intent.
- [ ] "Tarefa principal" e "Subtarefas" aparecem só com conteúdo e levam ao detalhe de cada uma.
- [ ] A seção Pedidos mostra "Criado por" e "Atualizado por" e leva ao detalhe de cada pedido.
- [ ] "Mais ações" → Excluir pede confirmação, manda `DELETE /api/tasks/{id}` e volta à tela anterior.
- [ ] Seções vazias não aparecem.
