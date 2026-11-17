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
2. **A principal mostra a fração das subtarefas diretas** ("1/4", com uma pizza das feitas). Tocar nela abre e fecha a
   gaveta logo abaixo da linha; começa aberta (as gavetas dentro da gaveta também). Os grupos e "N tarefas abertas" contam só as linhas.
3. **Cada subtarefa na gaveta** tem o glifo (o de pessoa abre a mesma escolha de status da lista e grava com a revisão
   dela), o nome que leva ao detalhe e o quando ("Sem data" não aparece). A subtarefa que tem as suas mostra a própria
   fração e abre uma gaveta dentro da gaveta.
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
- O Android ainda não tem a lista de tarefas; `docs/mobile-parity.md` registra a gaveta como pendente.
