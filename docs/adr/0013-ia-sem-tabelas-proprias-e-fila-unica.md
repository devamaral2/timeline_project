---
status: accepted
date: 2026-11-14
---

# IA sem tabelas próprias: pedido e passo são eventos, com fila única em `jobs`

## Contexto

A IA tem nove tabelas: `ai_jobs`, `ai_job_outbox`, `ai_processes`, `ai_process_steps`, `ai_process_entities`,
`ai_turn_traces`, `agent_conversations`, `agent_chat_messages` e `agent_chat_tickets`. As quatro últimas não têm
nenhum código que escreva nelas desde a remoção do chat legado. A entrega dos jobs passa por uma tabela de saída e
pelo RabbitMQ.

Com evento e artefato como as únicas entidades
([ADR 0011](./0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md)), toda interação com a IA passa a ser um
evento. A tela do chat com a IA não muda: o que muda é onde pedidos, passos, mensagens e traces são guardados.

## Decisão

1. **O pedido é um evento de agente.** A mensagem do usuário é a primeira entrada dele e a resposta final é a última.
2. **O passo é um evento de agente do tipo `step`**, ligado ao pedido pela relação `subtask`
   ([ADR 0012](./0012-relacoes-em-tres-tabelas-no-sentido-de-quem-produz.md)). O nome do agente interno fica em
   `data`. Passos não aparecem na lista de pedidos nem na agenda.
3. **`event_entries` guarda tudo o que se acrescenta a um evento**: `message`, `thought`, `trace`, `result` e `input`.
   A entrada nunca é alterada e não incrementa a `revision` do evento. O id é um ULID e dá a ordem. O texto do usuário
   só aparece em `message`, `thought` e `input`; `trace` guarda só números e códigos.
4. **O que um passo tocou vira relação partindo dele**: `creates`, `updates` ou `deletes` para artefato, e
   `generates`, `updates` ou `deletes` para evento.
5. **A sessão é a relação `follow_up`** do primeiro pedido para cada continuação. Não há tabela de conversa.
6. **Uma só tabela de fila, `jobs`.** O worker da própria aplicação busca os jobs na fila com `available_at` vencido,
   usando `FOR UPDATE SKIP LOCKED`. Repetir é voltar para a fila com `available_at` no futuro; worker morto é lease
   vencido que volta para a fila. Não há tabela de saída nem RabbitMQ. Entregar algo a um sistema externo, como um
   aviso no celular, é um tipo de job.
7. **O job é descartável; a fonte de verdade é o evento.** Todo job de IA aponta para o evento do passo que executa.
   `jobs.progress` é um retrato passageiro, que se perde com o job. O resultado mora no evento e nas entradas dele.
8. **Voz e geração de refeição também são eventos de agente.** A voz é um `request` que gera o evento de pessoa. A
   refeição é o evento de pessoa `meal` mais o artefato `food`; quando a IA preenche calorias e receita, um
   `build_request` altera esse artefato.

## Alternativas rejeitadas

- **Manter as três tabelas `ai_process*` até o redesenho do chat.** Guardariam passos, pensamentos e entidades tocadas
  fora do modelo de evento, e o redesenho já nasceria com duas formas de registrar a mesma coisa.
- **Guardar mensagens e traces num campo JSON do evento.** Cada acréscimo regravaria o evento inteiro e disputaria a
  `revision` com quem o estiver editando. Numa tabela à parte, acrescentar é só inserir.
- **Manter a tabela de saída e o RabbitMQ.** A tabela de saída só existe para entregar ao RabbitMQ com garantia. Com o
  worker lendo direto do banco, ela não tem função.

## Consequências

- Os passos superam os eventos de pessoa em volume. Os índices da agenda, das listas e do agente de consulta precisam
  deixá-los de fora.
- Uma entrada não se atualiza. O que hoje é um item de rastro que muda de "em curso" para "concluído" passa a ser duas
  entradas.
- A finalização de um mesmo pedido roda em série. Como o job aponta para o passo e não para o pedido, `jobs` leva uma
  `concurrency_key`.
- A proteção contra reenviar a mesma mensagem não pode depender de um job que será apagado: ela passa para
  `idempotency_keys`.
- O id das entradas só garante ordem dentro de um mesmo processo. Entradas gravadas no mesmo milissegundo por
  processos diferentes podem trocar de lugar.
- A rota por processo e a edição por alvo ([ADR 0006](./0006-edicao-por-alvo-pela-rota-por-processo.md)) continuam
  existindo, mas o armazenamento delas muda inteiro.
- O RabbitMQ sai de `apps/api/src/config/env.ts`, de `apps/api/src/infrastructure/ai-jobs/ai-jobs.service.ts` e do
  provisionamento de worktree, que hoje cria uma fila por worktree (`AGENTS.md` descreve esse passo).
- Pedidos e execuções agendadas passam a aparecer na agenda e na lista de tarefas, num cartão em verde-água que os
  separa dos eventos de pessoa.
- O chat de hoje não tem lista de sessões nem histórico: as mensagens vivem só na tela aberta. A relação `follow_up`
  guarda a continuidade, mas nenhuma tela a lê por enquanto.
- Continua em aberto por quanto tempo guardar passos e traces, e o controle de "finalizado" por entidade tocada, que
  por ora é uma entrada de resultado do passo.
- Nada disso está implementado.
