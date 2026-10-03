# Paridade web ↔ mobile

Este checklist acompanha a paridade entre a experiência mobile do web e o app
Android nativo. Atualize o status sempre que uma tela, fluxo, texto, cor ou
comportamento mudar.

Status: `—` (não existe), `🚧` (em progresso), `✅` (paridade), `≠`
(divergência intencional, com o motivo).

| Área | Funcionalidade | Web (referência) | Mobile | Observação |
|---|---|---|---|---|
| Sessão | Login | `components/auth/LoginForm.tsx` | ✅ | Gate e fluxo nativo implementados |
| Sessão | Refresh automático no 401 | `lib/api/authed-fetch.ts` | ✅ | Authenticator nativo implementado |
| Sessão | Logout | `components/auth/SessionButton.tsx` | ✅ | Drawer nativo revoga e limpa sessão |
| Agenda | Shell, header e navegação mobile | `mockups/eventos/mockup-shell.tsx`, `mobile-navigation.tsx`, `agenda-header-actions.tsx` | ✅ | Drawer e bottom bar nativos; conteúdo entra nas próximas issues |
| Agenda | Tira da semana | `components/events/WeekStrip.tsx` | ✅ | Seleção de dia integrada à timeline nativa |
| Agenda | Seletor de dia / navegação | `DayPicker.tsx`, `DateNavigator.tsx` | ✅ | Calendário mensal, swipe e carregamento por dia integrados |
| Agenda | Timeline do dia | `DayColumn.tsx`, `mockups/eventos/agenda-day.tsx` | ✅ | Loading, erro, vazio e refresh; cabeçalho do dia em Newsreader ("Hoje" + data) com contagem de eventos, sem o total de horas registradas |
| Agenda | Lista contínua com rolagem infinita | `mockups/eventos/agenda-preview.tsx` | ≠ | Chave ao lado de “Hoje” carrega dias ao chegar às bordas; o app navega um dia por vez (swipe e tira da semana), então não tem lista contínua |
| Agenda | Card de evento + visuais por tipo | `EventCard.tsx`, `event-visuals.ts` | ✅ | Ícone por tipo, duração em número grande (h/min), cronômetro em mono no evento em andamento, tags em chips; passado sem fundo e não realizado esmaecido; sem a barra proporcional |
| Agenda | Badge "atrasado" | `MissedBadge.tsx` | ✅ | Chip “NÃO REALIZADO” junto às tags para `missed` |
| Agenda | Skeleton de carregamento | `DaySkeleton.tsx` | ✅ | Skeleton nativo durante a primeira carga |
| Agenda | Tarefas/subtarefas no card | `mockups/eventos/task-controls.tsx` | ≠ | O endpoint de timeline não envia `taskIds`; vínculo será exibido no detalhe |
| Detalhe | Tela de detalhe | `[userId]/eventos/[eventId]/page.tsx` | ✅ | Coluna única do design system: barra (voltar, editar, mais ações → excluir), cabeçalho com ícone de situação (toque alterna aconteceu/não realizado), informações, descrição com “Ler mais”, cartão de nota para treino/refeição/sono e seções recolhíveis (séries, interrupções, tarefas vinculadas). Local e “Abrir em Notas” ficam de fora: não há campo nem tela no produto |
| Edição | Criar evento | `new-event-forms/*`, `event-schedule-fields.tsx` | ✅ | Tipo, descrição, agendamento, lembretes e POST nativo |
| Edição | Tags com sugestão | `new-event-forms/TagInput.tsx` | ✅ | Componente nativo compartilhado com debounce de 200 ms, limite 6 e chips em criação e edição |
| Edição | Editar refeição | `edit-event-forms/MealEditForm.tsx` | ✅ | PATCH tipado, campos comuns, tags, agenda, status e itens nutricionais |
| Edição | Editar rotina | `edit-event-forms/RoutineEditForm.tsx` | ✅ | Campos compartilhados, PATCH com revisão esperada e sem reenvio artificial de `items` |
| Edição | Editar sono | `edit-event-forms/SleepEditForm.tsx` | ✅ | Horas, qualidade, campos compartilhados e PATCH do item preservando os demais |
| Edição | Editar treino | `edit-event-forms/TrainingEditForm.tsx` | ✅ | Códigos, duração/calorias, ritmo/distância, séries e recálculo de `caloriesBurned` |
| Edição | Excluir | `DeleteEventDialog.tsx` | ✅ | Diálogo nativo, DELETE tipado, erro recuperável e recarga da agenda |
| Voz | Botão + reconhecimento | `VoiceEventButton.tsx`, `lib/speech/*` | ✅ | SpeechRecognizer nativo em pt-BR, parciais/finais, on-device quando disponível e RECORD_AUDIO em runtime |
| Voz | Fila e status | `VoiceJobStatus.tsx`, `lib/voice-events/*` | ✅ | Fila serial, estados pendente/erro, retry/dismiss, POST de voz e refresh ao esvaziar |
| Lembretes | Aviso no horário | `lib/events/use-due-notifications.ts` | 🚧 | Scheduler nativo com cálculo futuro, alarme exato/fallback inexato, canal, permissão e deep link ✅; sincronização no boot/logout entra na RAF-173 |
| Chat | Painel do agente | `mockups/eventos/agent-chat-panel.tsx` | ✅ | Painel Compose com nova conversa, sugestões, status, resposta, erros, retry, cancelamento, entidades e refresh da agenda |
| Chat | Histórico de conversas | `lib/agent-chat/use-agent-conversations.ts` | ✅ | Lista paginada, abertura de mensagens, exclusão otimista e atualização após novas respostas |
| Notas | Lista, detalhe e criação (prévia visual) | `mockups/eventos/notes-preview.tsx`, `[userId]/notas/page.tsx` | ✅ | HTMLs de Notas Névoa/Noite aplicados: filtros Todas/Eventos/Tarefas/Soltas, grupos por data, cards e títulos Newsreader, tags, busca, detalhe e criação com primeira linha como título. Web e Android usam os mesmos exemplos; rascunhos só em memória, sem integração com a API de notas. |
| Marca | Logo, fontes, cores | `brand/Logo.tsx`, `packages/theme`, `app/layout.tsx` | 🚧 | Tokens Névoa e Noite (Color.kt regenerado, fios `strand*`), Figtree/Newsreader/JetBrains Mono em `res/font`, escala de tipos e raios da Síntese, tema pelo sistema e assinatura “braid” na serifa ✅; símbolo Descendo e ícone adaptativo pendentes (logo Canvas ainda é o anel) |
| Fora da v1 | Aceite de convite | `convites/aceitar` | ≠ | Só web (link de e-mail) |
| Fora da v1 | Ver como convidado | `layout/ViewAsGuestButton.tsx` | ≠ | Depois da v1 |
