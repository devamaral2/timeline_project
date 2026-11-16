---
status: accepted
date: 2026-11-15
---

# Sequência entre eventos no lugar de subtarefa e bloqueio

## Contexto

A [ADR 0012](./0012-relacoes-em-tres-tabelas-no-sentido-de-quem-produz.md) deu aos eventos duas relações da pessoa:
`subtask` (um evento se desdobra em outros) e `blocks` (concluir um evento libera outro). As duas eram campos do
evento de origem, e por isso só um evento de pessoa podia ser ponta delas: o agente não pode ser revisado.

O dono do produto não usa hierarquia nem dependência de espera. O que ele precisa é encadear acontecimentos,
inclusive os do agente: um agente monitora a aplicação e, se algo falha, cria uma tarefa para a pessoa revisar o erro;
depois a pessoa cria um evento de agente de IA que faz a correção. Cada evento nasce **depois** de outro, e os dois
lados da cadeia podem ser de pessoa ou de agente.

## Decisão

1. **Uma só relação entre eventos para a ordem: `precedes`**, do antecessor (`from_event_id`) para o sucessor
   (`to_event_id`). Na interface são os dois lados da mesma linha: **"Segue-se de"** lista os antecessores e **"Da
   sequência a"** lista os sucessores. No contrato são `previousEventIds` (no cartão) e `nextEventIds` (no detalhe).
2. **`subtask` e `blocks` deixam de existir**, na tabela, nos contratos, na API do agente e nas telas. A migration
   converte `blocks` em `precedes` e apaga as linhas `subtask` de pessoa.
3. **A sequência é só informativa.** Não segura o sucessor em espera, não muda status e não dispara o agente. Some o
   "Espera por N eventos".
4. **A sequência não é campo de nenhum evento.** Mudá-la não revisa o antecessor nem o sucessor (revisa só o evento
   cujo formulário foi salvo, pelos campos dele). Isso substitui o ponto 8 da ADR 0012 para esta relação, e é o que
   permite que um evento de agente seja ponta. As arestas viajam no lote (`EntityBatch.sequence`, com `add` e
   `remove`) e entram depois de todos os eventos do lote, para que uma ponta possa ser um evento novo dele.
5. **A relação entre o pedido e os seus passos passa a ser `step`.** Antes era `subtask`, e só por isso a ADR 0013 a
   chamava assim. Fica fora da interface e fora do esquema do agente de consulta.
6. **O agente cria sequência**: a saída de criação de eventos tem `followsFrom` (as posições, na mesma lista, dos
   eventos de que cada um se segue). O finalizador do pedido só liga artefato a evento; a ordem entre dois eventos
   não é mais decidida por ele.
7. **A série leva `previousEventIds` no template**: cada ocorrência nasce se seguindo desses eventos, sem contar como
   edição deles. O `parentEventIds` antigo é ignorado.

## Alternativas rejeitadas

- **Manter `subtask` e `blocks` e só esconder no front.** O modelo antigo continuaria forçando que a ponta fosse um
  evento de pessoa, e o agente ficaria de fora da cadeia.
- **Dois tipos, `follows` e `precedes`, um para cada lado.** São a mesma aresta lida nos dois sentidos; gravar as duas
  garantiria divergência.
- **Sequência que segura o sucessor.** É um recurso novo (liberação ao concluir, trava de concorrência por evento) que
  ninguém pediu; a cadeia informativa já cobre o caso de uso.

## Consequências

- O banco não impede ciclos nem confere o dono das pontas. As duas conferências ficam em `applySequenceChanges`, sob a
  trava por usuário que já existia, como na ADR 0012.
- Gravar a mesma ligação duas vezes é inofensivo (`ON CONFLICT DO NOTHING`); a chave primária tem `relation`.
- Apagar um evento esconde a aresta nas leituras (`deleted_at`), e as arestas somem em cascata quando a linha é
  removida de verdade (ocorrência de série regerada).
- Quem tinha subtarefas perde a hierarquia: elas continuam existindo como eventos soltos. Os bloqueios viram "segue-se
  de" na mesma direção (o bloqueador passa a ser o antecessor).
- O Android ainda não desenha nenhuma dessas relações; `docs/mobile-parity.md` registra a divergência.
