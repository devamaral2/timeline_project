---
status: accepted
date: 2026-11-16
---

# Subtarefa no lugar da sequência entre tarefas

Substitui a [ADR 0014](./0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md).

## Contexto

A ADR 0014 trocou subtarefa e bloqueio por uma sequência informativa: qualquer tarefa podia "seguir-se de" várias
outras e ter vários sucessores. Na prática o dono do produto lê essa ligação como hierarquia: uma tarefa maior e as
partes dela. "Segue-se de" e "Da sequência a" não diziam isso, e o grafo de muitos para muitos permitia formas que
ninguém usa.

## Decisão

1. **A relação entre tarefas para organizar o trabalho é `subtask`**, da tarefa principal (`from_task_id`) para a
   subtarefa (`to_task_id`). `precedes` deixa de existir.
2. **É uma árvore.** Cada tarefa tem no máximo uma tarefa principal e quantas subtarefas quiser, em qualquer
   profundidade. O índice único parcial `task_task_subtask_unique` garante uma principal por tarefa; o ciclo continua
   conferido na escrita (`applySubtaskChanges`), sob a trava por usuário.
3. **Pôr uma tarefa sob outra principal tira a ligação com a anterior.** Não é erro: a subtarefa muda de lugar.
4. **Continua informativa e fora dos campos da tarefa**, como na ADR 0014: não segura nada em espera, não muda status,
   não mostra fração de progresso, e ligar ou desligar não revisa nenhuma das duas pontas. Por isso as duas pontas
   continuam podendo ser tarefa de pessoa ou de agente. As arestas viajam no lote em `EntityBatch.subtasks`.
5. **Contrato**: o cartão traz `parentTaskId` (ausente quando não há principal) e o detalhe traz `subtaskIds`. A
   criação e a edição recebem `parentTaskId` (`null` tira a tarefa de baixo da principal) e `subtaskIds` (a lista
   completa). O template da série troca `previousTaskIds` por `parentTaskId`.
6. **Telas**: o detalhe mostra "Tarefa principal" (uma linha) e "Subtarefas" (a lista), cada seção só quando tem
   conteúdo. Na edição, a principal é um espaço único com "+" e remover; as subtarefas são uma lista com "+".
7. **Agente**: a saída de criação de tarefas troca `followsFrom` por `subtaskOf`, a posição da principal na mesma
   lista. Atividades que só vêm uma depois da outra ("comer e depois nadar") não viram subtarefa. A consulta do agente
   enxerga a visão `task_subtasks` (`parent_task_id`, `subtask_id`) no lugar de `task_sequence`.

## Migração

`0007_subtarefa_no_lugar_de_sequencia` converte cada `precedes` em `subtask` no mesmo sentido (o antecessor vira a
principal). Quando uma tarefa se seguia de várias, fica a ligação mais antiga (`created_at`, depois o id) e as demais
são apagadas. No template das séries, a primeira tarefa de `previousTaskIds` vira `parentTaskId`.

## Alternativas rejeitadas

- **Só trocar os rótulos e manter o grafo de muitos para muitos.** "Tarefa principal" no singular mentiria quando a
  tarefa tivesse várias, e a hierarquia que o dono do produto pediu não existiria no modelo.
- **Recusar a segunda principal em vez de mover.** Obrigaria a tirar a subtarefa de um lugar antes de pô-la em outro,
  sem ganho: nenhuma das pontas é revisada, então mover não perde nada.
- **Principal acompanhando as subtarefas (fração, status derivado).** Ninguém pediu; fica para quando houver uso.

## Consequências

- Quem tinha uma tarefa seguindo várias perde as ligações mais novas dela.
- A ordem entre tarefas que só acontecem uma depois da outra deixa de ser registrada; o horário de cada uma já a mostra.
- O Android ainda não desenha nenhuma dessas relações; `docs/mobile-parity.md` registra a divergência.
