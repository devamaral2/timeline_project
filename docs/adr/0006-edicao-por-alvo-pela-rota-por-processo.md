---
status: accepted
date: 2026-11-09
---

# Edição por IA da entidade aberta, pela rota por processo

## Contexto

As telas de detalhe de evento, tarefa e nota ganharam um campo de conversa com a IA ("Peça ao Hermes para editar
este evento"). Quem escreve já está olhando para a entidade: o tipo e o id são conhecidos, então não há o que
reconhecer (JEV de entrada) nem o que escolher entre candidatos. O que falta é escolher o agente certo para cada tipo
(inclusive as notas de refeição, sono, treino e os arquivos de skill e agente do Hermes) e acompanhar o resultado.

## Decisão

1. **Uma rota nova na rota por processo (ADR 003):** `POST /api/ai/process/edit` recebe
   `{ userId, text, entityType, entityId }` e responde `202 { processId }`. O acompanhamento é o de sempre,
   `GET /api/ai/process/:id` (caixa de processo).
2. **`entityType`** é `event`, `task`, `note` (texto), `meal_note`, `sleep_note`, `training_note`, `skill_note` ou
   `agent_note`. O servidor carrega a entidade, confere dono e **confere que o tipo informado bate com o real**
   (nota de sono com `meal_note` falha com `type_mismatch`).
3. **A escolha do agente é uma tabela, não um modelo** (`EDIT_TARGET_AGENTS`), executada pelo worker
   `process-edit-target`, que cria o passo do agente com o retrato completo do alvo:

   | entityType | agente |
   |---|---|
   | `event` | `event-edit` |
   | `task` | `task-edit` |
   | `note` | `note-edit` |
   | `meal_note` | `food-note-edit` |
   | `sleep_note` | `sleep-note-edit` |
   | `training_note` | `training-edit` |
   | `skill_note`, `agent_note` | `agent-skill-note-edit` |

4. **Alvo único, sem consulta.** `event-edit`, `task-edit` e `note-edit` ganham o modo "Alvo": uma chamada, sem
   candidatos nem `query`, e só o `id` do alvo é aceito (outro id derruba o passo com `target_unknown`). Sem mudança,
   o passo falha com `nothing_to_change`. Nunca há pergunta de volta.
5. **O modelo não escreve números derivados.** `food-note-edit` devolve o novo texto da refeição e o servidor
   estima itens, totais e receita de novo (como na criação); `training-edit` devolve a lista completa de treinos e o
   servidor preenche nome (catálogo) e calorias; `sleep-note-edit` é validado por `parseSleepItem`.
6. **Skill e agente.** `agent-skill-note-edit` devolve o texto completo do arquivo; o servidor usa o caminho do
   alvo (nunca o do modelo), recusa a perda do cabeçalho `---` e grava com `AgentFilesService.write` (backup antes,
   escrita atômica, limite de 256 KB, mesmo rollback da ADR 0005). Só o dono edita (ADR 0004). **Sessões do Hermes
   que já leram a skill não mudam; sessões novas leem o texto novo.** Não há troca de sessão do Hermes.
7. **Finalização sem vínculo.** Com uma única entidade no processo não há candidato a vincular, então a finalização
   fecha o processo sem chamar o JEV.

## Consequências

- Os rótulos novos ficam em `ui.json` (`steps` e `targetFailed`); as falhas do alvo (`not_found`, `type_mismatch`,
  `busy`) fecham o processo como `failed` com texto predefinido, sem passo.
- A edição de skill/agente não passa pelo Hermes (diferente de `POST /api/ai/config/edit-request`, que segue
  existindo para pedidos livres sobre os arquivos).
- Web e Android mostram a barra nos detalhes (ver `docs/mobile-parity.md`); o Android ainda não tem detalhe de
  tarefa, então a tarefa só tem a barra no web.
