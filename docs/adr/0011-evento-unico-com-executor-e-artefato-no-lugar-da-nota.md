---
status: accepted
date: 2026-11-14
---

# Evento único, com executor e status, e artefato no lugar da nota

## Contexto

O banco tem 28 tabelas. Evento e tarefa são entidades separadas, cada uma com as suas tabelas de tags, de notas e de
recorrência, e a IA tem nove tabelas próprias. Quase toda regra existe duas vezes: há um agente de série para evento e
outro para tarefa, e a ocorrência de evento grava o fim do bloco em `finished_at` enquanto a de tarefa grava em
`estimated_finish_at`.

O dono quer um sistema bem menor, em que tudo gire em torno de duas entidades: o que alguém faz e o conteúdo que
isso produz ou usa.

## Decisão

1. **Duas entidades.** `events` registra o que uma pessoa ou um agente faz ou vai fazer. `artifacts` guarda conteúdo
   que não é fluxo: não tem status, horário nem executor, e é editável. Tarefa deixa de existir como entidade; a nota
   vira o artefato de texto.
2. **Executor.** A coluna `actor` (`human` ou `agent`) diz quem realiza o evento. Não há `agent_id`: o banco não
   aponta para qual agente, só distingue pessoa de agente.
3. **Tipo e status dependem do executor**, e o banco impõe isso por check.
   - Pessoa: tipos `common`, `meal`, `sleep`, `training`; status `todo`, `toDefine`, `doing`, `inHold`, `done`,
     `cancel`, `missed`.
   - Agente: tipos `request`, `search_request`, `build_request`, `inquiry_request`, `review_request`, `cron`, `step`;
     status `queued`, `running`, `waiting`, `done`, `failed`, `cancel`. **Os status de agente foram substituídos pela
     ADR 0023:** são `preparing`, `queued`, `starting`, `running`, `waiting`, `completed`, `interrupted`, `failed`,
     `cancelled` e `rolled_back`.
4. **Evento de referência.** Um evento de pessoa pode não ter status: só marca um horário na agenda. Continua
   editável e pode passar a ter status a qualquer momento. Evento de agente sempre tem status.
5. **Datas.** `started_at` é o início planejado, `estimated_finish_at` é o fim planejado (o bloco da agenda) e
   `finished_at` é a conclusão real. Não há check entre `finished_at` e `started_at`, porque concluir hoje um evento
   marcado para amanhã é válido. O fim planejado não pode vir antes do início, exceto no evento longo, em que o
   início é o real e pode acontecer depois do prazo.
6. **Evento longo.** `long_running` marca o evento de pessoa que fica fora da agenda, como um projeto. Exige status e
   não aceita recorrência. As datas dele são início real, prazo e conclusão, e nenhuma o coloca na agenda. As sessões
   de trabalho são eventos normais, ligados a ele na sequência de eventos
   ([ADR 0014](./0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md)). Um evento que não é longo dura no
   máximo 31 dias, por check.
7. **Artefato.** Os tipos são `text`, `food`, `sleep`, `training`, `workout`, `skill`, `agent` e `router`. Alimento e
   refeição são um tipo só (`food`, com calorias e receita). Um artefato sem dono é global: todos leem, ninguém edita
   pelo app, e só existe para `food` e `workout`. Os catálogos `food`, `meal` e `workout` deixam de ser tabelas.
8. **Recomeço do zero.** Os dados e o histórico de migrations atuais são descartados. Não há migração de dados.

## Alternativas rejeitadas

- **Uma tabela para evento de pessoa e outra para evento de agente.** As relações entre eventos teriam de apontar para
  duas tabelas, e a agenda, que mostra os dois executores, viraria uma união. Uma tabela com `actor` e checks por
  executor entrega a mesma separação.
- **`agent_id` apontando para um artefato do tipo agente.** O dono quis só a marca de quem executa. O nome do agente
  interno de um passo fica em `data`.
- **Um conjunto único de status.** Os estados de uma pessoa (a definir, em espera, perdido) e os de uma execução
  (na fila, rodando, falhou) não se sobrepõem.
- **Deduzir o evento longo pela duração.** O limite seria arbitrário e o evento mudaria de tela sozinho ao editar uma
  data. Além disso, "ainda sem horário" e "nunca vai ter horário" são coisas diferentes.

## Consequências

- "Agendada" deixa de ser status: é um evento `todo` com horário, calculado na tela. `missed` continua sendo marca
  manual do usuário, sem rotina que vire sozinha. Num evento longo, prazo vencido é "atrasado", também calculado na
  tela.
- As interrupções de evento (`event_interruptions`) deixam de existir. O cartão da agenda, o detalhe do evento e o
  esquema que o agente de consulta lê perdem esse dado.
- A agenda e a lista de tarefas mostram eventos de pessoa e de agente, juntos ou filtrados por executor, com o mesmo
  cartão. Passos ficam fora das duas.
- A recorrência perde `target_kind`: existe um só tipo de ocorrência, e o fim planejado vai sempre em
  `estimated_finish_at`.
- As listas de tarefas e de notas hoje carregam tudo do usuário e filtram em memória. Com passos de agente em
  `events` e cópias de alimento em `artifacts`, os filtros precisam ir para o SQL, com índices parciais por tela.
- A entrega é API, depois web e só então Android. A regra de paridade web e mobile fica suspensa nesse intervalo, e a
  exceção precisa ser registrada em `docs/mobile-parity.md` quando a implementação começar.
- Nada disso está implementado.
