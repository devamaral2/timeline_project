---
status: accepted
date: 2026-11-16
---

# Subtarefas dentro da principal na lista de tarefas

Altera o item 4 da [ADR 0016](./0016-subtarefa-no-lugar-da-sequencia.md) só para a lista de tarefas.

## Contexto

A ADR 0016 deixou a hierarquia só no detalhe: na lista, toda tarefa com status era uma linha, e a principal não
mostrava fração. Com a lista cheia de partes de tarefas maiores, o dono do produto pediu que a subtarefa apareça só
vinculada à principal e nunca solta na lista. Ele escolheu o modelo A ("Gaveta") entre os cinco do canvas
"Lista de tarefas — subtarefas".

## Decisão

1. **Na lista de tarefas, a subtarefa cuja principal está na lista não vira linha.** Ela fica na gaveta da principal,
   na ordem em que a lista vem da API (`nestSubtasks` em `apps/web/src/lib/tasks/task-groups.ts`).
2. **A principal mostra quantas subtarefas diretas estão feitas** ("1 de 4 feitas", com uma pizza das feitas), no topo
   do fio, acima da primeira subtarefa. Tocar nessa linha abre e fecha as subtarefas; começa aberta (as gavetas dentro
   da gaveta também). Os grupos e "N tarefas abertas" contam só as linhas. Até 2026-11-28 era a fração "1/4" na ponta
   direita da linha da principal; ela empurrava a prioridade e o projeto para a esquerda, e o dono do produto pediu que
   os dois fiquem sempre na linha do título (quadro C do canvas "Lista de tarefas · prioridade e projeto à direita").
   No mesmo dia ele mudou a ponta direita da linha para duas alturas: em cima o status do agente ou a duração da
   tarefa de pessoa; embaixo a prioridade (ou o provedor) e o projeto.
3. **Cada subtarefa na gaveta** tem o glifo (o de pessoa abre a mesma escolha de status da lista e grava com a revisão
   dela), o nome que leva ao detalhe e o quando ("Sem data" não aparece). Na de agente, o ícone quadrado do status fica
   na extrema direita (no lugar do robô que havia ali) e a esquerda leva um ponto inerte (2026-11-28). A subtarefa que tem as suas ganha a mesma
   linha das feitas abaixo dela e abre uma gaveta dentro da gaveta.
4. **Sem a principal na lista, a subtarefa continua linha**: filtro, modo de visualização ou principal sem status
   não fazem a tarefa sumir. Um ciclo vindo da rede também não esconde ninguém.
5. A relação continua informativa como na ADR 0016: a fração só conta, não muda o status da principal nem segura
   nada em espera. O detalhe e a agenda não mudam.

## Alternativas rejeitadas

Os outros quatro modelos do canvas: barra segmentada com folha de baixo (B), cartão com checklist sempre aberto (C),
anel no glifo com só a próxima subtarefa (D) e pilha de cartões (E).

## Consequências

- Uma subtarefa só é encontrada na lista abrindo a principal; a busca e os filtros ainda a acham pela API, e ela
  aparece como linha quando a principal não passa no filtro.
- O Android tem a mesma gaveta (`ui/tasks/SubtaskDrawer.kt`); `docs/mobile-parity.md` registra a paridade.
