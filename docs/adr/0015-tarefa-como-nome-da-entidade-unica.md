---
status: accepted
date: 2026-11-15
---

# Tarefa como nome da entidade única

A entidade única de ação se chama **Tarefa / Task**, e não mais Evento / Event. O nome "evento" sugere algo que
acontece e é só registrado, e descreve mal o que a entidade é: algo que uma pessoa ou um agente faz ou vai fazer. A
[ADR 0011](./0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md) rejeitou "tarefa" um dia antes porque ela
ainda era a entidade separada que deixava de existir; com essa entidade removida, o nome ficou livre.

## Decisão

1. **Esta ADR substitui só o nome** usado nas ADRs 0011 e 0014 ("evento", "evento de referência", "evento longo",
   "sequência entre eventos" passam a "tarefa", "tarefa de referência", "tarefa longa", "sequência entre tarefas").
   Nenhuma decisão de modelo muda: executor, artefato, relações, tipos, status, sequência informativa e fila única
   continuam como as ADRs 0011 a 0014 decidiram.
2. **Nenhuma estrutura antiga é mantida.** Sem alias de tipo, rota duplicada, redirect, ferramenta ou permissão com o
   nome anterior, nem coluna ou tabela com o nome antigo. Um endereço ou rota antiga responde como inexistente.
3. **O histórico não é reescrito.** As ADRs antigas e as migrations já aplicadas continuam dizendo "evento"; esta ADR
   diz o que mudou. O glossário passa a listar "evento" como termo a evitar.
4. **Ficam como estão** os valores que não carregam o nome da entidade (tipos, status, executores e tipos de
   relação), a Agenda e a tela Tarefas, e os eventos de DOM e o `text/event-stream`, que não são a entidade.

## Alternativas rejeitadas

- **Manter "evento" no código e dizer "tarefa" só na tela.** Dois nomes para a mesma coisa faria cada conversa com o
  agente e cada leitura do código exigir tradução.
- **Manter aliases por um tempo.** Seria estrutura antiga que ninguém removeria; a troca é feita de uma vez, por
  símbolo, com uma varredura que falha se o nome antigo voltar.
