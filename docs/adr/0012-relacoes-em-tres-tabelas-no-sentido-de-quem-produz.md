---
status: accepted
date: 2026-11-14
---

# Relações em três tabelas, no sentido de quem produz o quê

## Contexto

Hoje cada par de entidades tem a sua tabela de ligação (`event_tasks`, `event_notes`, `task_notes`,
`recurrence_notes`), a hierarquia de tarefas é uma coluna de pai e o bloqueio entre tarefas é outra tabela
(`task_dependencies`). Com só duas entidades
([ADR 0011](./0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md)), o dono quer relações N:N com sentido
entre eventos, entre artefatos e entre os dois.

## Decisão

1. **Três tabelas, uma por par de entidades**: `event_event_relation`, `event_artifact_relation` e
   `artifact_artifact_relation`. Cada linha tem as duas pontas e o tipo da relação.
2. **O sentido é de quem produz para o que foi produzido.** Um evento de pedido cria um artefato e gera um evento para
   a pessoa: ele é a origem das duas relações.
3. **Entre eventos**, os tipos são `generates`, `updates`, `deletes`, `subtask`, `blocks` e `follow_up`.
4. **Entre evento e artefato**, a relação parte sempre do evento, que `creates`, `updates`, `uses` ou `deletes` o
   artefato. Há uma linha por par: se o evento criou e depois alterou o artefato, a relação continua `creates`. A
   posição na lista do evento é opcional, porque a relação de um passo de agente não tem posição em lista nenhuma.
5. **Entre artefatos**, o único tipo é `derives`, do original para a cópia. O que foi comido num evento é uma cópia do
   alimento, para que editar o original não mude o passado. A cópia também leva a marca `derived`, para que a lista
   de alimentos não precise consultar a relação linha a linha.
6. **Não existe `parent_id`.** Subtarefa é a relação `subtask`, e por isso um evento pode ser subtarefa de mais de um
   evento maior. Bloqueio é a relação `blocks`: concluir um evento libera outro.
7. **Sessão é relação, não entidade.** O primeiro pedido se liga a cada pedido de continuação por `follow_up`, em
   estrela. Cada continuação tem uma só origem, garantida por índice único.
8. **Mexer numa relação é editar o evento de origem**, quando ele é de pessoa: a escrita exige a `revision` esperada
   dele e a incrementa. O destino nunca é tocado. Relações que partem de evento de agente e a relação `derives` não
   incrementam nada: são o registro do que foi produzido, não a edição de um formulário.

## Alternativas rejeitadas

- **Uma tabela `links` com quatro chaves opcionais.** Era a proposta inicial. Cada linha precisaria de um check para
  garantir que exatamente duas chaves estão preenchidas, e os tipos de relação de pares diferentes ficariam
  misturados. Com três tabelas, as chaves estrangeiras são obrigatórias e cada tabela tem o seu conjunto de tipos.
- **`parent_id` em `events`.** Seria um segundo mecanismo de ligação ao lado das relações, e limitaria a subtarefa a
  um só evento maior.
- **Sentido pela ordem do fluxo** (o que vem antes aponta para o que vem depois). Não responde quem é a origem quando
  um pedido produz várias coisas ao mesmo tempo.

## Consequências

- Apagar o evento maior não apaga as subtarefas.
- O banco não impede ciclos em `subtask` e `blocks`, nem garante que as duas pontas são do mesmo usuário. As duas
  conferências ficam na escrita, sob a trava por usuário que já existe. Sem a trava, duas transações inserindo A para
  B e B para A passariam juntas.
- Ler subtarefas ou bloqueios em profundidade exige consulta recursiva. As três tabelas precisam de índice nos dois
  sentidos.
- Ao concluir um bloqueador, o evento bloqueado precisa ser travado antes de se decidir a liberação. Sem isso, dois
  bloqueadores concluídos ao mesmo tempo veem um ao outro em aberto e ninguém libera.
- Editar uma série apaga fisicamente as ocorrências futuras em que ninguém mexeu, e as relações delas vão junto. Por
  isso um passo que cria uma série registra o id da série na entrada de resultado, e não numa relação.
- Uma ocorrência de série que ganha ou perde uma relação passa a ser só dela e se destaca da série, como já acontece
  hoje ao vincular uma nota.
- A subtarefa muda de lado. Hoje ligar uma tarefa a um pai edita a tarefa filha; agora edita o evento maior, que é a
  origem da relação. Quem estiver com o evento maior aberto para edição recebe o conflito de revisão.
- Um passo de agente que altera um evento já incrementa a `revision` dele pela alteração em si. A relação que registra
  o que o passo tocou não incrementa de novo.
- Nada disso está implementado.
