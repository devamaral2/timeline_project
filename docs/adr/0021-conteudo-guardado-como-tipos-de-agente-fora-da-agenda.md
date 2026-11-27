---
status: accepted
date: 2026-11-26
---

# Conteúdo guardado: dois tipos de tarefa de agente, fora da agenda

Parte da spec #39 (transcrição de vídeos do YouTube) e do ticket #40.

## Contexto

Toda tarefa de agente que não era um passo entrava como `request`, então não dava para distinguir um pedido do chat
de uma página guardada pela extensão. A transcrição de vídeo, além disso, precisa de um estado de espera que os
status de agente não tinham: o pedido nasce na hora e só anda quando o computador de casa o pega. Por fim, cada
página guardada com horário viraria um cartão na grade da agenda.

## Decisão

1. **`request` fica só para o pedido do chat e da voz.** Entram dois tipos de agente: `save_content` (a página de texto
   guardada pela extensão) e `save_content_with_transcription` (o vídeo do YouTube guardado para transcrever).
2. **Entra o status de agente `awaiting_transcription`**: o pedido espera o serviço local. O ciclo e o que cada tipo
   faz ficam na spec #39; este registro cobre só os conjuntos fechados. Eles mudam juntos: `apps/api/src/domain/sets.ts`,
   o check do Postgres (migration `0009_tipos_de_conteudo_guardado`), `packages/contracts`, o web e o Android.
3. **As duas tarefas ficam fora da agenda, como os passos** (`OFF_AGENDA_KINDS`). A consulta da agenda, o índice parcial
   `tasks_agenda_idx`, o filtro `kind` da rota e o `isAgendaCard` do web e do Android as deixam de fora, mesmo quando a
   resposta as traz.
4. **Continuam na lista de pedidos e na lista de tarefas** (têm status), e nas relações da Leitura diária. O passo segue
   fora das três.
5. `awaiting_transcription` cai no grupo "Em espera" da lista, tem a cor de aviso do `waiting` (com um relógio no lugar das
   barras), e a tela que relê tarefas de agente abertas o conta como aberto.

## Alternativas rejeitadas

- Manter `request` para tudo e distinguir por um campo de dados: o tipo é fechado e aparece no check, nos filtros e nas
  telas; um campo solto não é verificado por ninguém.
- Deixar as tarefas de conteúdo guardado na agenda: cada página guardada ocuparia um cartão na grade e esconderia o dia.

## Consequências

- Uma migration troca os dois checks de `tasks` e recria o índice da agenda; os dados existentes não mudam (nenhuma
  linha usa os valores novos antes das tickets seguintes).
- O MCP aceita `awaiting_transcription` no filtro de status da lista de tarefas, mas não oferece os tipos novos no filtro
  da agenda.
- O filtro `kind` da rota da agenda passa a recusar `save_content` e `save_content_with_transcription` (400), como já
  recusava `step`.
