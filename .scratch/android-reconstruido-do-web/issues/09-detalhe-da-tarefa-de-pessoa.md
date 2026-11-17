# 09: Detalhe da tarefa de pessoa

**What to build:** Tocar numa tarefa de pessoa na Agenda ou em Tarefas abre o detalhe: topo com tipo, título, status e prioridade editáveis ali mesmo, Informações completas, tarefa principal e subtarefas como links, "Criado por" e "Atualizado por", e "Mais ações" com Excluir. Documentos da tarefa ficam para o ticket 16; Editar, para o 13.

**Blocked by:** 04

**Status:** done

**Leia antes:** o [README](README.md). No web: a rota de detalhe da tarefa, a vista da tarefa de pessoa, a seção de hierarquia, a formatação do detalhe e o diálogo de excluir.

- [x] O detalhe lê `GET /api/tasks/{id}`; o mesmo destino de navegação mostra esta vista para pessoa e deixa a de agente para o ticket 10.
- [x] Status e prioridade mudam no topo com a `revision` lida (com `finishedAt` como no ticket 04); a tarefa de referência não mostra status nem prioridade no topo.
- [x] Informações: início, fim planejado e duração (prazo e "atrasada" na tarefa longa), recorrência, local, lembretes, tags e descrição, com a formatação portada e conferida contra fixtures do TS.
- [x] Tocar no local abre o mapa do Android por intent.
- [x] "Tarefa principal" e "Subtarefas" aparecem só com conteúdo e levam ao detalhe de cada uma.
- [x] A seção Pedidos mostra "Criado por" e "Atualizado por" e leva ao detalhe de cada pedido.
- [x] "Mais ações" → Excluir pede confirmação, manda `DELETE /api/tasks/{id}` e volta à tela anterior.
- [x] Seções vazias não aparecem.

**Nota (implementação):** o web não escreve "atrasada" no detalhe (só colore a linha nas listas); o app segue o web e mostra "Previsão de entrega" com a data. Sem emulador nesta sessão: a comparação lado a lado com o web e os screenshots do PR ficam pendentes.
