# Paridade web ↔ mobile

Este checklist acompanha a paridade entre a experiência mobile do web e o app
Android nativo. Atualize o status sempre que uma tela, fluxo, texto, cor ou
comportamento mudar, no mesmo PR que muda o web ou o Android.

Status: `—` (não existe), `🚧` (em progresso), `✅` (paridade), `≠`
(divergência intencional, com o motivo).

O app Android foi apagado e reconstruído a partir do web de hoje; o plano está em
[`docs/prd/android-reconstruido-do-web.md`](prd/android-reconstruido-do-web.md) e os
tickets em `.scratch/android-reconstruido-do-web/issues/`. As linhas abaixo descrevem as
telas do web **de hoje** (tarefa única com executor, artefato exibido como "documento",
pedido ao agente), e a coluna "Observação" diz qual ticket entrega cada uma. O vocabulário é
o do glossário em [`CONTEXT.md`](../CONTEXT.md): `Task`, `Artifact`, `Request`, `Step`,
`Entry` no código, e "tarefa", "documento", "pedido", "passo" na tela.

Fora do escopo do app, por decisão da spec: iOS, aceite de convite (continua no web, pelo link do
e-mail), o que só existe no desktop (cabeçalho com "Buscar e criar", Ctrl/⌘K, popover de conta, layouts de
duas colunas, atalhos de teclado do editor), o código morto ou de exemplo do web (vista `/buscar` do chat,
botão e fila de voz não montados, `POST /api/requests/voice`, `/mockups`), as animações do web, os canvases
ainda não aplicados no web e a troca de "Hermes" por "Candeia".

| Área | Funcionalidade | Web (referência) | Mobile | Observação |
|---|---|---|---|---|
| Sessão | Entrar com e-mail e senha, com o botão "Entrar" travado até os dois campos terem texto | `components/auth/LoginForm.tsx` | ✅ | Ticket 01. Fala direto com `POST /auth/login` e `GET /auth/me`. |
| Sessão | Mensagens de erro ("E-mail ou senha incorretos.", "Muitas tentativas. Aguarde um pouco e tente novamente.", "Não foi possível entrar agora. Tente novamente em instantes.") | `components/auth/LoginForm.tsx` | ✅ | Ticket 01. |
| Sessão | Continuar conectado ao reabrir | `lib/session` (cookies httpOnly no web; DataStore cifrado pelo Keystore no app) | ✅ | Ticket 01. |
| Sessão | Renovar a sessão num 401 e voltar ao login quando a renovação é recusada | `lib/session/refresh-session.ts` | ✅ | Ticket 01. Auth fora do ar não encerra a sessão, como no web. |
| Sessão | Sair da conta | `/configuracoes` do chat | — | Ticket 21. A revogação do refresh token já existe na camada de sessão. |
| Navegação | Barra inferior Tarefas, Agenda e Documentos, com o rótulo só na aba atual; a Agenda abre primeiro | `components/shell` | ✅ | Ticket 03. Os ícones são os mesmos SVG do web (`BraidIcons`). A pílula da aba atual usa o âmbar do modo "Todas as tarefas", o padrão do web; a troca de cor por executor chega com o ticket 05. Tarefas e Documentos abrem telas vazias até os tickets 07 e 11. O voltar da Agenda sai do app; nas outras abas volta a ela. Sem emulador nesta sessão: a comparação lado a lado com o web ainda não foi feita. |
| Navegação | Botão do agente separado das abas, com os estados ocioso, ouvindo, pensando, feito e erro, e o X com o chat aberto | `components/shell` | 🚧 | Ticket 03 entrega o círculo com o robô em repouso, que ainda não abre nada; os estados, o X e o chat chegam com o ticket 12. |
| Navegação | Menu da seção ao tocar de novo na aba atual: título com contagem, listas, busca e engrenagem | `components/shell`, `components/hub` | — | Ticket 05. |
| Navegação | Filtro de executor (Todos, Você, Agentes) guardado e valendo nas três seções | `components/shell` | — | Ticket 05. Vai para o DataStore. |
| Navegação | "Limpar filtros" e o ponto na aba com filtro ativo | `components/shell` | — | Ticket 05. |
| Navegação | O voltar do sistema fecha menu, folha ou diálogo antes de sair | — | — | Adaptação Android; começa no ticket 05. |
| Agenda | Tarefas de pessoa e de agente do dia, com início, fim, duração, tags, ícone do tipo e glifo do executor | `components/agenda` | ✅ | Ticket 03. Lê a semana do dia escolhido (`GET /api/tasks` com `from` e `to`, seguindo o cursor, sem `limit` nem `actor`), como o web. Segue o web onde o ticket diverge: na linha da tarefa as tags são `#tag` no cinza de apoio (as cores de tag, `hueForTag` e `tagColors`, estão portadas e testadas, mas só os filtros e a edição as usam); no celular o web esconde a barra com "Por dia", "Em sequência" e o resumo do dia ("5 tarefas · 3 h 50 planejadas"), então o app não os mostra; o toque na linha e no glifo de status não faz nada até os tickets 04 e 09. A data de hoje no topo fica fixa em vez de sair da tela ao rolar. |
| Agenda | Faixa da semana, seletor de mês e "Hoje"; swipe entre dias | `components/agenda` | ✅ | Ticket 03. O swipe passa de uma semana para a outra, o que o carrossel de sete dias do web não faz. |
| Agenda | Tarefa que atravessa a meia-noite nos dois dias; tarefas longas e passos fora da agenda | `components/agenda`, `packages/timeline` | ✅ | Ticket 03. `packages/timeline`, `hueForTag` e `tagColors` portados e conferidos contra fixtures geradas pelas funções TS. |
| Agenda | Esqueleto de carregamento e erro com "Tentar de novo" | `components/agenda` | ≠ | Ticket 03. O web mostra só "Não foi possível carregar a agenda. Tente novamente.", sem botão; o app acrescenta "Tentar de novo", como o ticket pede. |
| Agenda | Mudar o status pelo ponto da tarefa de referência (sem status), com `revision` e recarga no conflito | `components/agenda/task-controls.tsx` | — | Ticket 04. |
| Agenda | Atualização sozinha das tarefas de agente abertas (3 s, só com a tela visível) | `components/agenda` | — | Ticket 04. |
| Agenda | Modo "Em sequência", de 7 em 7 dias | `components/agenda/agenda-screen.tsx` | — | Ticket 06. |
| Agenda | Tempo livre de 15 minutos ou mais, e o toque que abre o chat com a janela anexada | `components/agenda/free-time.ts` | — | Ticket 06. |
| Tarefas | Grupos Em curso, A fazer, Sem data, Em espera, Feitas e Encerradas, com os dois últimos recolhidos | `components/task-list` | — | Ticket 07. |
| Tarefas | Status de pessoa pelo glifo da linha; status de agente só leitura; série como uma linha | `components/task-list` | — | Ticket 07. |
| Tarefas | Filtros por tag, prioridade e texto, e estado vazio com "Nova tarefa" | `components/task-list`, `components/hub` | — | Ticket 07. |
| Tarefas | Gaveta de subtarefas: fração e pizza, aninhamento, status inline, subtarefa que volta a ser linha sem a principal | `components/task-list`, ADR 0017 | — | Ticket 08. |
| Detalhe da tarefa de pessoa | Tipo, título, status e prioridade inline; informações, tarefa longa e atrasada; local abre o mapa do Android | `components/task-detail`, `components/detail` | — | Ticket 09. |
| Detalhe da tarefa de pessoa | Principal e subtarefas como links; "Criado por" e "Atualizado por" | `components/task-detail` | — | Ticket 09. |
| Detalhe da tarefa de pessoa | Documentos inline (texto, alimento, treino, sono) com a relação de cada um | `components/task-detail` | — | Ticket 09. |
| Detalhe da tarefa de pessoa | "Mais ações": editar e excluir com confirmação | `components/task-detail` | — | Ticket 09. |
| Detalhe da tarefa de pessoa | Adicionar documento pelo detalhe | `components/task-detail` | — | Ticket 16. |
| Detalhe da tarefa de pessoa | Caixa de edição por IA no rodapé | `components/detail/EntityAiEditBar.tsx` | — | Ticket 20. |
| Detalhe da tarefa de agente | Status, informações, hierarquia, entradas, passos, o que produziu, sessão, registro e falha | `components/task-detail` | — | Ticket 10. |
| Detalhe da tarefa de agente | Continuar a sessão, cancelar (e o 409 do pedido de alimento), atualização sozinha a cada 3 s | `components/task-detail` | — | Ticket 10. |
| Criação e edição | Criar e editar tarefa (a criação não tem tarefa persistente, hierarquia nem documentos, só a edição): tipo, tarefa de referência, tarefa longa, datas em passos de 5 minutos, lembretes, tags, local | `components/edit`, `components/new-task-forms`, `components/new-item` | — | Ticket 13. |
| Criação e edição | `Idempotency-Key` na criação, `revision` na edição e aviso de conflito; erros no campo | `components/edit` | — | Ticket 13. |
| Criação e edição | Recorrência (diária, semanal, mensal e anual, com intervalo): série, mudar a regra, excluir a série, avulsa que passa a repetir | `components/edit` | — | Ticket 14. |
| Criação e edição | Hierarquia: principal e subtarefas num seletor, trocar de principal, criar ou pedir ao agente que crie | `components/edit/EntityPickerDialog.tsx` | — | Ticket 15. |
| Criação e edição | Documentos da tarefa: ordenar, adicionar e remover; alimento copiado com a quantidade | `components/edit`, `components/artifact-edit` | — | Ticket 16. |
| Documentos | Lista com filtros por texto e executor (na largura mobile o web não tem filtro de tipo nem de tag); skills, agentes e roteadores contam como "Agentes" | `components/notes` | — | Ticket 11. |
| Documentos | Leitura de texto (markdown), alimento (com "calculando"), sono, treino e exercício; tarefas ligadas | `components/notes`, `components/detail` | — | Ticket 11. |
| Documentos | Criar (pelo `/nota` do chat, sem botão "Novo documento"), editar e excluir a nota de texto; criar alimento a partir de texto livre; globais só leitura | `components/notes`, `components/artifact-edit` | — | Ticket 17. |
| Documentos | Arquivos do agente (só o dono): caminho, hash, markdown ou texto cru, backups e restauração, edição por IA | `components/notes` | — | Ticket 18. |
| Chat | Folha que expande para tela cheia, atalhos de comando, pedido com caixa de processo e cancelamento | `components/hub` | — | Ticket 12. |
| Chat | "Conversa" e "Processo", markdown e botões de escolha, reencontro de pedidos abertos, retry, "Nova conversa", `/hermes` e `/app` | `components/hub` | — | Ticket 12. |
| Chat | Feed de notificações pelo chat (últimas 24 horas e próximos), com lido/não lido | `components/hub` | — | Ticket 23. |
| Chat | `/configuracoes`: tema (interruptor claro/escuro, com o sistema decidindo até a primeira escolha) e sair | `components/hub` | — | Ticket 21. |
| Voz | Escuta ao abrir, 1,8 s de silêncio envia, volta a ouvir até "para" ou "chega", permissão do microfone | `components/hub` | — | Ticket 19. `SpeechRecognizer` em pt-BR atrás de uma interface. |
| Voz | Microfone nas caixas de edição por IA dos detalhes | `components/detail/EntityAiEditBar.tsx` | — | Ticket 20. |
| Lembretes | Notificação do Android no horário de cada lembrete, com janela de 1 h e sem repetir; reagenda ao sincronizar e no boot | `lib` de lembretes do web | — | Ticket 22. Alarme exato com queda para o inexato. |
| Lembretes | Tocar na notificação abre o detalhe da tarefa | `lib` de lembretes do web | — | Ticket 22. |
| Aparência | Cores geradas de `packages/theme`, fontes Figtree, Newsreader e JetBrains Mono, tema do sistema | `styles/globals.css`, `app/layout.tsx` | 🚧 | Ticket 01 entrega tokens, fontes e `BraidTheme`; o ticket 03 acrescenta os ícones da barra e as cores de tag (portadas, ainda sem tela que as use). A spec cita Manrope e Outfit, mas o web de hoje usa as três fontes ao lado, e o web é a referência. |
| Aparência | Escolha manual de tema guardada | `app/layout.tsx` (`braid-theme`) | — | Ticket 21. |
