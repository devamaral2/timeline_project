---
status: ready-for-agent
date: 2026-11-17
---

# Spec: o app Android reconstruído a partir do web

Referências: ADRs [0011](../adr/0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md),
[0012](../adr/0012-relacoes-em-tres-tabelas-no-sentido-de-quem-produz.md),
[0013](../adr/0013-ia-sem-tabelas-proprias-e-fila-unica.md),
[0015](../adr/0015-tarefa-como-nome-da-entidade-unica.md),
[0016](../adr/0016-subtarefa-no-lugar-da-sequencia.md) e
[0017](../adr/0017-subtarefas-dentro-da-principal-na-lista.md); o glossário em [CONTEXT.md](../../CONTEXT.md);
as specs [do web no banco novo](./web-no-banco-novo.md) e [tarefa no lugar de evento](./tarefa-no-lugar-de-evento.md),
que deixaram o Android "para uma spec própria"; a regra de paridade em [mobile-parity.md](../mobile-parity.md); e o
[runbook da primeira reescrita](../runbook/mobile-rewrite.md), de onde vêm as decisões de stack que continuam valendo.

## Problema

O app Android em `apps/mobile` foi escrito contra o modelo antigo: evento, tarefa e nota como entidades separadas,
chat por WebSocket e tabelas próprias de IA. A API e o web já trocaram esse modelo pela tarefa única com executor,
pelo artefato no lugar da nota e pelos pedidos ao agente como tarefas. O Android não acompanhou: não funciona contra a
API atual, os testes de contrato dele falham, o job de CI foi removido e quase toda linha de
`docs/mobile-parity.md` diz "Android pendente". Ele ainda fala "evento" e "nota" no código, nas rotas e nos textos.

Para quem usa, o resultado é que não existe app no celular: quem quer ver a agenda, marcar uma tarefa como feita ou
pedir algo ao agente pelo telefone precisa abrir o web no navegador. Para quem mantém, cada mudança visível no web
deveria ter o par no Android, e hoje não há base sobre a qual fazer isso. Portar o app atual peça por peça custaria
mais do que reescrevê-lo, porque o modelo de domínio, as rotas, os contratos e boa parte das telas mudaram.

## Solução

Apagar o app atual por completo e construir um novo app Android nativo, em Kotlin e Jetpack Compose, que repercute
o web de hoje na largura mobile: as mesmas telas, os mesmos fluxos, os mesmos textos, as mesmas cores, falando com os
mesmos endpoints, sem nenhuma mudança na API, no Auth ou nos contratos. O vocabulário do app é o do glossário desde
o primeiro commit: tarefa, artefato (documento na tela), pedido, passo, subtarefa, entrada. Nenhum nome antigo
sobrevive.

O usuário entra com e-mail e senha, vê a Agenda, a lista de Tarefas e os Documentos pela barra inferior, filtra por
executor (Todos, Você, Agentes) e por listas pelo menu da seção, abre, cria, edita e exclui tarefas e documentos,
muda o status de uma tarefa com um toque, conversa com o agente por texto ou voz e recebe os lembretes das tarefas
como notificações do Android. Onde o web usa algo do navegador, o app usa o equivalente do Android: voltar do
sistema, folhas inferiores, swipe entre dias, reconhecimento de voz do sistema e alarmes locais.

## Histórias de usuário

### Sessão

1. Como usuário, quero entrar com e-mail e senha, para usar o app com a minha conta.
2. Como usuário, quero ver uma mensagem clara quando o e-mail ou a senha estão errados, para saber o que corrigir.
3. Como usuário, quero continuar conectado ao reabrir o app, para não digitar a senha toda vez.
4. Como usuário, quero que a sessão se renove sozinha quando expira, para não ser interrompido no meio de uma ação.
5. Como usuário, quero voltar à tela de login quando a renovação falha, para entrar de novo sem ver erros soltos.
6. Como usuário, quero sair da conta pelas configurações, para que o celular não fique com a minha sessão.
7. Como usuário, quero que os meus tokens fiquem guardados com criptografia no aparelho, para que outro app não os leia.

### Navegação

8. Como usuário, quero uma barra inferior com Tarefas, Agenda e Documentos, para ir de uma seção a outra com um toque.
9. Como usuário, quero ver o rótulo só da aba atual, como no web, para a barra ficar limpa.
10. Como usuário, quero que a Agenda seja a aba aberta ao entrar, para ver o meu dia primeiro.
11. Como usuário, quero um botão do agente separado das abas, para abrir o chat de qualquer tela.
12. Como usuário, quero que o botão do agente mostre se ele está ouvindo, pensando, terminou ou falhou, para saber o que está acontecendo sem abrir o chat.
13. Como usuário, quero que o botão do agente vire um X com o chat aberto, para fechá-lo pelo mesmo lugar.
14. Como usuário, quero tocar de novo na aba atual para abrir o menu da seção, para filtrar e buscar sem sair da tela.
15. Como usuário, quero ver no menu o título da seção com a contagem, para saber quantos itens estou vendo.
16. Como usuário, quero escolher entre as listas Todos, Você e Agentes, para ver só as tarefas e documentos de um executor.
17. Como usuário, quero que a escolha de executor valha para as três seções e sobreviva ao fechar o app, para não refazê-la.
18. Como usuário, quero listas extras por seção (uma lista por tag em Tarefas), para chegar rápido a um recorte comum.
19. Como usuário, quero buscar por texto pelo menu da seção, para achar uma tarefa ou documento pelo nome.
20. Como usuário, quero uma engrenagem com as opções da seção (prioridades em Tarefas; "Por dia", "Em sequência" e "Tempo livre" na Agenda), para ajustar a vista.
21. Como usuário, quero "Limpar filtros" e um ponto na aba quando há filtro ativo, para nunca esquecer que estou vendo um recorte.
22. Como usuário, quero que o voltar do Android feche o menu, a folha ou a tela aberta antes de sair do app, para navegar como em qualquer app Android.

### Agenda

23. Como usuário, quero ver as tarefas de pessoa e de agente do dia na Agenda, com início, fim planejado, duração, tags, ícone do tipo e glifo do executor, para entender o meu dia.
24. Como usuário, quero uma faixa da semana e um seletor de mês com "Hoje", para ir a qualquer dia.
25. Como usuário, quero passar de um dia para o outro com swipe, para navegar com o polegar.
26. Como usuário, quero o modo "Em sequência", que carrega a agenda de 7 em 7 dias para frente e para trás, para rolar pelo tempo sem trocar de dia.
27. Como usuário, quero ver as tarefas que atravessam a meia-noite nos dois dias, para não perder o fim delas.
28. Como usuário, quero ver os intervalos de tempo livre de 15 minutos ou mais, quando a opção estiver ligada, para saber onde cabe algo.
29. Como usuário, quero tocar num intervalo livre para abrir o chat com aquela janela anexada numa conversa nova, para pedir ao agente que a preencha.
30. Como usuário, quero tocar no ponto de status de uma tarefa e escolher entre os sete status de pessoa, para atualizar sem abrir o detalhe.
31. Como usuário, quero que a agenda recarregue quando a minha alteração chega atrasada em relação a outra, para nunca sobrescrever uma mudança mais nova.
32. Como usuário, quero que as tarefas de agente abertas se atualizem sozinhas, para ver o pedido terminar sem puxar a tela.
33. Como usuário, quero que tarefas longas e passos não apareçam na agenda, como no web, para ver só o que tem horário.
34. Como usuário, quero ver um esqueleto enquanto o dia carrega e uma mensagem com "Tentar de novo" quando a rede falha, para saber o estado da tela.

### Tarefas

35. Como usuário, quero ver as tarefas acompanhadas agrupadas em Em curso, A fazer, Sem data, Em espera, Feitas e Encerradas, para saber o que está pendente.
36. Como usuário, quero que Feitas e Encerradas comecem recolhidas, para focar no que falta.
37. Como usuário, quero mudar o status de uma tarefa de pessoa pelo glifo da linha, para avançar o trabalho com um toque.
38. Como usuário, quero ver o status de uma tarefa de agente sem poder mudá-lo, para não confundir o que o agente controla.
39. Como usuário, quero ver uma série recorrente como uma linha só, para a lista não se repetir.
40. Como usuário, quero que a subtarefa cuja principal está na lista fique na gaveta da principal, e não solta, para ver o trabalho organizado.
41. Como usuário, quero ver na principal a fração e a pizza das subtarefas diretas feitas, e abrir e fechar a gaveta com um toque, para acompanhar o progresso.
42. Como usuário, quero mudar o status de uma subtarefa de pessoa dentro da gaveta, para não precisar abrir o detalhe.
43. Como usuário, quero gavetas dentro de gavetas quando uma subtarefa tem as suas, para ver a árvore inteira.
44. Como usuário, quero que a subtarefa volte a ser linha quando a principal não está na lista, para que um filtro nunca esconda uma tarefa.
45. Como usuário, quero filtrar por tag, prioridade e texto, para achar uma tarefa numa lista grande.
46. Como usuário, quero um estado vazio com "Nova tarefa", para criar a primeira tarefa a partir dali.

### Detalhe da tarefa de pessoa

47. Como usuário, quero ver o tipo, o título, o status e a prioridade no topo do detalhe e mudar status e prioridade ali mesmo, para agir rápido.
48. Como usuário, quero ver início, fim planejado, duração, recorrência, local, lembretes, tags e descrição, para ter todas as informações da tarefa.
49. Como usuário, quero que uma tarefa longa mostre início real e prazo, e diga que está atrasada quando o prazo venceu, para acompanhar projetos.
50. Como usuário, quero tocar no local para abrir o mapa do Android, para chegar ao lugar.
51. Como usuário, quero ver a tarefa principal e as subtarefas como links, para andar pela árvore.
52. Como usuário, quero ver os documentos da tarefa com o conteúdo inline (texto, alimento, treino, sono) e a relação de cada um, para não precisar abri-los.
53. Como usuário, quero adicionar um documento a uma tarefa pelo detalhe, salvando na hora, para ligar conteúdo sem entrar na edição.
54. Como usuário, quero ver "Criado por" e "Atualizado por" com os pedidos que mexeram na tarefa, para saber o que o agente fez.
55. Como usuário, quero editar ou excluir a tarefa pelo menu "Mais ações", com confirmação antes de excluir, para não apagar por engano.
56. Como usuário, quero pedir ao agente, por uma caixa de texto no rodapé do detalhe, que edite esta tarefa, para mudar algo descrevendo em palavras.

### Criação e edição de tarefa

57. Como usuário, quero criar uma tarefa pelo chat (`/tarefa`) ou pelo estado vazio, já com o nome preenchido quando eu o digitei, para não reescrever.
58. Como usuário, quero escolher o tipo (comum, refeição, treino, sono), para a tarefa ter os campos e documentos certos.
59. Como usuário, quero escolher "Sem status" para criar uma tarefa de referência, e trocar para um status depois, para marcar só um horário.
60. Como usuário, quero escolher data e hora de início e de fim com seletores do Android em passos de 5 minutos, para marcar horários sem digitar.
61. Como usuário, quero ligar "Tarefa persistente" para criar uma tarefa longa, com prazo no lugar do fim e status obrigatório, para registrar um projeto.
62. Como usuário, quero escolher os dias da semana em que a tarefa se repete, para criar uma série.
63. Como usuário, quero, numa ocorrência de série, mudar a regra ou excluir a série inteira, para ajustar a repetição.
64. Como usuário, quero que uma tarefa avulsa que passa a se repetir vire uma série a partir do dia seguinte, como no web, para não duplicar o dia de hoje.
65. Como usuário, quero escolher lembretes de 1 minuto a 30 dias antes, para ser avisado a tempo.
66. Como usuário, quero tags com sugestões enquanto digito, para reaproveitar as tags que já uso.
67. Como usuário, quero sugestões de lugar no campo local, para preencher o endereço rápido.
68. Como usuário, quero escolher a tarefa principal e as subtarefas num seletor, e nele criar uma tarefa nova ou pedir ao agente que crie, para montar a hierarquia sem sair da edição.
69. Como usuário, quero que pôr a tarefa sob outra principal tire a ligação anterior, sem erro, como no web.
70. Como usuário, quero ordenar, adicionar e remover documentos da tarefa, com a fonte certa por tipo (alimentos com quantidade na refeição, exercícios no treino, meus documentos nos demais), para registrar o que comi, treinei ou usei.
71. Como usuário, quero que o alimento adicionado a uma refeição seja uma cópia com a quantidade, para que editar o original não mude o passado.
72. Como usuário, quero "Descartar" e "Salvar" no rodapé, e que salvar duas vezes por um toque duplo não crie duas tarefas, para não gerar duplicatas.
73. Como usuário, quero ser avisado e ver a versão nova quando outra pessoa ou o agente mudou a tarefa enquanto eu editava, para não perder nenhuma das duas mudanças sem saber.
74. Como usuário, quero ver os erros de validação no campo que os causou, para corrigir sem adivinhar.

### Tarefa de agente e pedidos

75. Como usuário, quero abrir uma tarefa de agente e ver o status dela, as informações e a hierarquia, para acompanhar o pedido.
76. Como usuário, quero ver as entradas do pedido, os passos (feitos/total), o que ele produziu (o que criou, alterou ou apagou), a sessão, o registro e a falha, para entender o que o agente fez.
77. Como usuário, quero continuar a mesma sessão com um novo pedido a partir do detalhe, para seguir a conversa ali.
78. Como usuário, quero cancelar um pedido em andamento, e ver por que não posso quando o pedido é de alimento, para parar o que não quero mais.
79. Como usuário, quero que o detalhe de um pedido aberto se atualize sozinho, para ver o progresso.

### Documentos

80. Como usuário, quero a lista de documentos com filtro por tipo, tag, texto e executor, para achar um documento.
81. Como usuário, quero que skills, agentes e roteadores contem como "Agentes" no filtro de executor, como no web.
82. Como usuário, quero ler um texto em markdown renderizado, para ver formatação, listas e links.
83. Como usuário, quero ver um alimento com calorias, macros, ingredientes e receita, e um estado "calculando" que se atualiza sozinho até o agente terminar, para saber quando o valor está pronto.
84. Como usuário, quero ver os documentos de sono, treino e exercício com o conteúdo de cada tipo, para consultá-los no celular.
85. Como usuário, quero ver as tarefas ligadas ao documento com a relação de cada uma e o registro, para saber de onde ele veio.
86. Como usuário, quero criar uma nota de texto ou um alimento a partir de texto livre (`/nota` no chat ou "Novo documento"), para registrar algo rápido.
87. Como usuário, quero editar a minha nota de texto num editor de markdown com os modos escrever e ler, para escrever no celular.
88. Como usuário, quero excluir a minha nota com confirmação, para não apagar por engano.
89. Como usuário, quero ver os documentos globais (alimentos e exercícios) só para leitura, para não tentar editar o que não é meu.

### Arquivos do agente (só o dono)

90. Como dono, quero abrir um documento de skill ou de agente e ver o caminho, o hash da versão e o aviso de "ausente da pasta", para saber o estado do arquivo.
91. Como dono, quero alternar entre markdown renderizado e texto cru, para ler o arquivo como ele é.
92. Como dono, quero ver os backups do arquivo e restaurar um deles com confirmação, para desfazer uma mudança.
93. Como dono, quero pedir ao agente que edite o arquivo por uma caixa de texto e ver o pedido terminar, para mudar a skill sem editor.
94. Como usuário que não é o dono, quero que essa seção simplesmente não apareça, para não ver ações que não posso fazer.

### Chat com o agente

95. Como usuário, quero abrir o chat como uma folha que posso expandir para a tela inteira, para conversar sem perder a tela de baixo.
96. Como usuário, quero atalhos para os comandos `/tarefa`, `/nota`, `/notificacoes` e `/configuracoes` na tela inicial do chat, para chegar rápido a eles.
97. Como usuário, quero que cada mensagem minha vire um pedido com uma caixa de processo que mostra os passos e permite cancelar, para acompanhar o agente.
98. Como usuário, quero alternar entre "Conversa" e "Processo", para ver a resposta ou a linha do tempo dos traces.
99. Como usuário, quero ver as respostas em markdown e tocar nos botões de escolha que o agente oferece, para responder com um toque.
100. Como usuário, quero que o chat reencontre os pedidos ainda abertos quando eu o reabro, para não perder uma resposta que chegou com o app fechado.
101. Como usuário, quero tentar de novo uma mensagem que falhou, sem reescrevê-la, para não perder o texto.
102. Como usuário, quero começar uma "Nova conversa", para mudar de assunto.
103. Como usuário, quero alternar para o modo Hermes com `/hermes` e voltar com `/app`, e ver uma mensagem clara quando o Hermes está desligado, para escolher com quem falo.
104. Como usuário, quero ver o feed de notificações pelo chat, com os lembretes vencidos das últimas 24 horas e os próximos, para não perder nada.
105. Como usuário, quero trocar o tema (sistema, claro, escuro) e sair da conta por `/configuracoes`, para ajustar o app.

### Voz

106. Como usuário, quero que o app comece a ouvir ao abrir o chat, como no web, para falar sem tocar em nada.
107. Como usuário, quero que 1,8 segundo de silêncio envie a mensagem, para não precisar tocar em enviar.
108. Como usuário, quero que o app volte a ouvir depois da resposta até eu dizer "para" ou "chega", para conversar sem as mãos.
109. Como usuário, quero que o app peça a permissão de microfone na primeira vez e explique quando ela foi negada, para entender por que a voz não funciona.
110. Como usuário, quero um microfone nas caixas de edição por IA dos detalhes, para ditar o pedido.

### Lembretes

111. Como usuário, quero receber uma notificação do Android no horário de cada lembrete das minhas tarefas, mesmo com o app fechado, para não esquecer.
112. Como usuário, quero que um lembrete atrasado por até 1 hora ainda dispare, e que nenhum dispare duas vezes, como no web.
113. Como usuário, quero que os lembretes se reagendem quando a agenda muda e depois que o celular reinicia, para que valham sempre.
114. Como usuário, quero que o app peça a permissão de notificação e de alarme exato, e continue com alarmes aproximados se eu negar o exato, para ainda ser avisado.
115. Como usuário, quero tocar na notificação para abrir o detalhe da tarefa, para agir sobre ela.

### Aparência

116. Como usuário, quero as mesmas cores, fontes (Manrope e Outfit), ícones da barra e cores de tag do web, para reconhecer o produto.
117. Como usuário, quero que o app siga o tema claro ou escuro do sistema, a menos que eu escolha um, para combinar com o meu celular.
118. Como usuário, quero os mesmos textos do web em português, para não ter dois produtos.

### Para quem mantém

119. Como mantenedor, quero que o app atual seja apagado de uma vez, sem código antigo convivendo com o novo, para não traduzir entre dois modelos.
120. Como mantenedor, quero que o código, as rotas e os textos usem só o vocabulário do glossário, com uma verificação que falha se "evento" ou "nota" como entidade voltarem, para que o nome antigo não reapareça.
121. Como mantenedor, quero que os DTOs do Kotlin sejam conferidos contra fixtures geradas dos schemas de `packages/contracts`, para que uma mudança de contrato quebre o teste do Android e não o app em produção.
122. Como mantenedor, quero que toda lógica portada à mão do TS seja conferida contra fixtures geradas pelas funções TS, para que web e Android calculem igual.
123. Como mantenedor, quero que as cores venham de um gerador a partir de `packages/theme`, para nunca copiar um hex à mão.
124. Como mantenedor, quero subir o app com `pnpm dev:mobile` contra o backend local, para desenvolver como nos outros apps.
125. Como mantenedor, quero que `docs/mobile-parity.md` seja refeito para o app novo, linha por linha, para saber o que está em paridade.
126. Como mantenedor, quero que a skill `kotlin-android` descreva o app novo com o vocabulário novo, para que agentes que mexem no app sigam o desenho certo.
127. Como mantenedor, quero que o job de CI do mobile volte, filtrado por caminho, quando a suíte nova estiver verde, para que contrato e app não se separem de novo.

## Decisões de implementação

### Ordem e fronteiras

- O app atual é apagado no primeiro PR, inteiro. O histórico do git guarda o código; nada dele é copiado por padrão.
  Peças de infraestrutura que não dependem do domínio (cifra da sessão no Keystore, gerador de tema, `Authenticator`
  de refresh) podem ser reescritas olhando o histórico, mas entram como código novo, com os testes novos.
- O projeto Gradle continua em `apps/mobile`, com um `package.json` fino que chama o `./gradlew` (`lint`, `test`,
  `build`, `android`, `generate:theme`) e fica fora do `pnpm dev`. O `applicationId` continua `app.braid.mobile`.
- Nenhuma mudança na API, no Auth, no web ou em `packages/*`. Onde o web e o contrato não bastarem, o app segue o web
  e a lacuna vira nota em `docs/mobile-parity.md`, não mudança de backend.
- O web é a referência de comportamento e de texto. Antes de cada tela, o comportamento é conferido no componente web
  correspondente, não na documentação, que já se mostrou desatualizada.
- Ordem sugerida, um PR por fase, cada um com a paridade atualizada:
  0. apagar o app, scaffold novo, skill `kotlin-android` reescrita, gerador de fixtures;
  1. rede, sessão, login, DTOs e verificação de vocabulário;
  2. shell: barra inferior, botão do agente, menu da seção e filtros persistidos;
  3. Agenda;
  4. lista de Tarefas com a gaveta de subtarefas;
  5. detalhe da tarefa de pessoa e da tarefa de agente;
  6. criação e edição, com recorrência, hierarquia e documentos;
  7. Documentos e arquivos do agente;
  8. chat e voz;
  9. lembretes e feed de notificações.

### Stack

Mantém as decisões do runbook da primeira reescrita, menos o WebSocket: Kotlin, Jetpack Compose, `minSdk 26`,
Hilt, Retrofit + OkHttp, kotlinx.serialization, Navigation Compose com rotas tipadas, MVVM com `ViewModel` e
`StateFlow<UiState>`, DataStore com criptografia via Android Keystore, sem Room, um módulo Gradle só, e as camadas
`ui → domain ← data` com `core` (design system, rede, auth). Não há cache offline: o app mostra o que a API devolve
e um erro com "Tentar de novo" quando ela não responde.

### Sessão e rede

- O app fala direto com o **Auth** para `POST /auth/login`, `POST /auth/token/refresh`, `POST /auth/logout` e
  `GET /auth/me`, e direto com a **API** com `Authorization: Bearer`, nos mesmos caminhos que o web usa através do
  proxy dele.
- Um 401 dispara uma renovação e uma repetição da chamada, uma vez só, com renovações concorrentes coalescidas numa.
  Falhou a renovação, a sessão é apagada e o app volta ao login.
- Toda criação manda `Idempotency-Key`; toda edição de tarefa de pessoa e de relação manda a `revision` esperada. A
  resposta de conflito recarrega a entidade e avisa o usuário, como no web.
- Endpoints que o app cobre (os mesmos do web; os que o web não usa ficam de fora):
  - Tarefas: `GET /api/tasks` (janela da agenda, paginada por cursor, com `actor` e `tag`),
    `GET /api/tasks/tracked` (lista acompanhada, com `actor`, `status`, `priority`, `tag`, `q`), `POST /api/tasks`,
    `GET|PATCH|DELETE /api/tasks/{id}`.
  - Recorrência: `POST /api/recurrences`, `GET|PATCH|DELETE /api/recurrences/{id}`.
  - Artefatos: `GET /api/artifacts` (com `type`, `scope=global`, `tag`, `q`, `taskId`, `limit`),
    `POST /api/artifacts`, `GET|PATCH|DELETE /api/artifacts/{id}`.
  - Apoio: `GET /api/tags`, `GET /api/places`.
  - Pedidos: `POST /api/requests`, `POST /api/requests/edit`, `POST /api/requests/hermes` (404 = Hermes desligado),
    `GET /api/requests`, `GET /api/requests/{id}`, `POST /api/requests/{id}/cancel` (409 no pedido de alimento).
  - Arquivos do agente: `GET /api/ai/config`, `GET /api/ai/config/file`, `GET /api/ai/config/backups`,
    `POST /api/ai/config/restore`, `POST /api/ai/config/edit-request` (403 para quem não é dono: a seção some).
- Não há WebSocket nem SSE. O que é ao vivo é por consulta periódica, com os intervalos do web: 3 s para pedidos e
  tarefas de agente abertas (parando quando ninguém está aberto ou a tela sai de vista), 180 s de limite para a caixa
  de processo e 5 min para a fonte dos lembretes.

### Domínio e vocabulário

- Os nomes do código seguem o glossário em inglês, como os contratos: `Task`, `Artifact`, `Request`, `Step`,
  `Entry`, `Relation`, `Recurrence`, `Actor`. Na tela, artefato é "documento" e a lista se chama "Documentos".
- Uma verificação no build ou nos testes varre o código do app e falha se `Event`/`evento` ou `Note`/`nota` aparecerem
  como nome de entidade, nos moldes da varredura que a ADR 0015 pediu para o resto do repositório. "Nota" continua
  permitido só como rótulo de tela da nota de texto, como no web.
- Tipos e status dependem do executor, como na ADR 0011: pessoa (`common`, `meal`, `sleep`, `training`; `todo`,
  `toDefine`, `doing`, `inHold`, `done`, `cancel`, `missed`, ou sem status na tarefa de referência) e agente (tipos de
  pedido, `cron`, `step`; `queued`, `running`, `waiting`, `done`, `failed`, `cancel`). O app só oferece mudar o status
  de tarefa de pessoa.
- Subtarefa segue as ADRs 0016 e 0017: árvore, uma principal por tarefa, informativa, gaveta só na lista de tarefas.

### Lógica portada à mão

O Kotlin não importa os pacotes TS, então o que era import vira espelhamento verificado. Cada peça tem um porte à mão
e um teste contra fixtures geradas pelo código TS:

| Origem no TS | O que é portado |
|---|---|
| `packages/contracts` | DTOs `@Serializable` escritos à mão, um por schema que o app usa |
| `packages/timeline` | chaves de dia e fuso de São Paulo, semana, deslocamento de dia, início e fim do dia, formatação de data e hora, dias de uma tarefa que cruza a meia-noite, posições na agenda |
| `packages/theme` | tokens por gerador de código no build; `hueForTag` portado à mão |
| lógica de tela do web | grupos da lista de tarefas e a gaveta de subtarefas, filtro de executor (inclusive skill/agente/roteador como "Agentes"), texto dos cartões, formatação do detalhe, tempo livre, cálculo dos lembretes (offsets, janela de 1 h, chaves já disparadas), escolhas citadas na resposta do agente |

O gerador de fixtures volta a existir num script da raiz que roda os schemas Zod e as funções TS e grava JSON nos
recursos de teste do app. Rodá-lo é parte de `pnpm --filter @repo/mobile run test`, para que a regra do `AGENTS.md`
(mudou contrato ou tema, rode os testes do mobile) pegue a divergência.

### Telas e adaptações ao Android

- **Shell.** Barra inferior com Tarefas, Agenda e Documentos e o botão do agente à parte, com os estados do web
  (ocioso, ouvindo, pensando, feito, erro). O menu da seção abre ao tocar de novo na aba atual. O filtro de executor
  é guardado no DataStore e vale para as três seções; listas, busca e engrenagem são por seção, como no web.
- **Navegação.** Rotas tipadas para Agenda, Tarefas, nova tarefa (com nome opcional), detalhe da tarefa (o mesmo
  destino escolhe a vista de pessoa ou de agente pelo executor), edição da tarefa, Documentos, novo documento,
  detalhe e edição do documento. O voltar do sistema fecha primeiro o menu, a folha ou o diálogo abertos.
- **Folhas e seletores.** Seletores de status, de data e hora, de hierarquia e de documentos são folhas inferiores ou
  os seletores nativos de data e hora, com os mesmos passos e limites do web.
- **Chat.** Folha não modal que expande para tela cheia. Mesmos comandos do web, menos `/buscar`, cuja vista no web
  só filtra dados de exemplo.
- **Voz.** `SpeechRecognizer` do Android em pt-BR, com o mesmo laço do web (escuta ao abrir, 1,8 s de silêncio envia,
  volta a ouvir até "para" ou "chega"). O reconhecimento fica atrás de uma interface, para os testes trocarem por um
  falso.
- **Lembretes.** O app calcula os lembretes a partir dos offsets das tarefas, com as mesmas fontes do web (agenda das
  últimas 24 h aos próximos 31 dias e a lista acompanhada), e os agenda com `AlarmManager` exato, caindo para o
  inexato quando a permissão é negada. Reagenda a cada sincronização e no boot. A notificação abre o detalhe da
  tarefa. As chaves já disparadas ficam no DataStore.
- **Local.** Tocar no local abre um intent de mapa do Android no lugar do link do Google Maps.
- **Tema.** Cores geradas de `packages/theme`, fontes Manrope e Outfit, ícones da barra iguais aos do web, tema do
  sistema com escolha manual guardada.

### Documentação e instruções

- `docs/mobile-parity.md` é reescrito para o app novo: a exceção do "banco novo" e a da troca de nome saem, as linhas
  passam a descrever as telas de hoje, e cada fase marca as suas.
- A skill `kotlin-android` é reescrita com o vocabulário novo e o fluxo de uma tela do começo ao fim (API, repositório,
  ViewModel, tela) sobre `Task`, além de como gerar as fixtures e como rodar o app contra o backend local.
- O runbook da primeira reescrita fica como histórico, com uma nota apontando para esta spec.
- O job de CI do mobile volta quando a suíte nova estiver verde, filtrado por mudanças em `apps/mobile`,
  `packages/contracts`, `packages/timeline` e `packages/theme`.

## Decisões de teste

### O que é um bom teste aqui

Um teste descreve o que o usuário faz e o que vê, e o que o app pede à API. Ele não olha para chamadas internas,
mapeadores ou detalhes de Compose. O formato padrão é: a API falsa responde com fixtures geradas dos contratos; o teste
cria o ViewModel da tela com a infraestrutura real (Retrofit, OkHttp, `Authenticator`, repositório, serialização)
apontada para essa API falsa; dispara as ações do usuário; e confere o `UiState` emitido e as requisições recebidas
(método, caminho, query, corpo, `revision`, `Idempotency-Key`, `Authorization`).

### A fronteira

Há uma fronteira só para o comportamento das telas: a **rede**. Abaixo dela, um `MockWebServer` serve as fixtures;
acima, tudo é código real do app. As únicas outras trocas são pelas fronteiras do sistema operacional, cada uma atrás
de uma interface pequena: relógio, agendador de alarmes, notificações do sistema, reconhecimento de voz e armazenamento cifrado. Não há
repositórios falsos escritos à mão.

A lógica portada à mão do TS é conferida no mesmo espírito: as funções Kotlin recebem as entradas das fixtures geradas
pelas funções TS e precisam devolver as mesmas saídas.

### O que é testado

- **Contratos**: toda fixture de cada schema usado decodifica no DTO Kotlin, e os corpos que o app envia passam no
  schema Zod correspondente (o gerador também grava exemplos de entrada válidos e inválidos).
- **Sessão**: login, erro de credencial, renovação única com repetição em 401, renovações concorrentes coalescidas,
  volta ao login quando a renovação falha, logout que apaga a sessão.
- **Shell e filtros**: filtro de executor persistido e compartilhado, listas por seção, busca, "Limpar filtros",
  indicador de filtro ativo.
- **Agenda**: janela do dia e da semana, modo em sequência carregando de 7 em 7 dias, tarefas que cruzam a meia-noite,
  tempo livre, troca de status com `revision` e recarga no conflito, consulta periódica só com tarefa de agente aberta.
- **Tarefas**: grupos, série como uma linha, gaveta de subtarefas (fração, aninhamento, subtarefa que volta a ser linha
  sem a principal, ciclo vindo da rede), filtros.
- **Detalhes**: tarefa de pessoa (status e prioridade inline, documentos inline, adicionar documento, excluir), tarefa
  de agente (entradas, passos, produziu, sessão, continuar, cancelar e o 409 do alimento).
- **Criação e edição**: validação por campo, tarefa de referência, tarefa longa, recorrência nos três casos do web,
  hierarquia (inclusive trocar de principal), documentos por tipo com a cópia do alimento, idempotência no toque
  duplo, conflito de `revision`.
- **Documentos**: filtros, tipos de conteúdo, alimento "calculando" até terminar, criação de nota e alimento, edição e
  exclusão só da nota própria, globais só leitura, arquivos do agente com 403 escondendo a seção, backups e restauração.
- **Chat e voz**: pedido com caixa de processo e cancelamento, reencontro de pedidos abertos, retry, nova conversa,
  `/hermes` com o 404, botões de escolha; laço de voz com reconhecimento falso (silêncio envia, "para" encerra,
  permissão negada).
- **Lembretes**: cálculo e agendamento com relógio e agendador falsos (janela de 1 h, sem repetir disparo, reagendar na
  sincronização e no boot, queda para alarme inexato).
- **Vocabulário**: a varredura de nomes antigos.

### Testes de UI

Testes instrumentados de Compose não fazem parte da fronteira desta spec. A comparação visual com o web é manual, na
definição de pronto de cada PR: o app no emulador contra o backend local, lado a lado com o web em 390×844, com
screenshot dos dois no PR.

### Precedentes

- No app que será apagado (no histórico do git): os testes de rede com `MockWebServer` (autenticação e repositório de
  eventos), o teste de fixtures de contrato e os testes de paridade da timeline e das cores de tag, que são o modelo do
  gerador de fixtures; e os testes de ViewModel com Turbine, que são o modelo de como observar o `UiState`.
- No web: os testes de grupos de tarefas, de modo de visualização, de texto dos cartões, de formatação do detalhe e de
  modelo do pedido, que descrevem o comportamento que o Android precisa reproduzir e são a melhor fonte das fixtures
  da lógica de tela.

## Fora de escopo

- iOS e qualquer plataforma que não seja Android.
- Qualquer mudança na API, no Auth, no web, no banco ou em `packages/*`.
- Aceite de convite: continua no web, aberto pelo link do e-mail.
- O que no web é só de desktop: o cabeçalho com "Buscar e criar" e Ctrl/⌘K, o popover de conta, layouts em duas
  colunas e os atalhos de teclado do editor.
- O que no web é código morto ou de exemplo: a vista de `/buscar` do chat, o botão e a fila de voz não montados,
  `POST /api/requests/voice`, as telas de `/mockups` e os dados de exemplo sem sessão.
- Animações específicas do web (View Transitions, voo do Hermes); o app usa as transições padrão do Android até o
  canvas de movimento ser aplicado no web.
- Canvases ainda não aplicados no web (opções da barra inferior, movimento, blocos de resposta do agente, a entidade
  única nos boards não aplicados).
- A troca de "Hermes" por "Candeia" nos textos: o app usa os rótulos que o web usa hoje.
- Cache offline, Room e qualquer sincronização em segundo plano além dos lembretes.
- Push enviado pelo servidor: os lembretes são locais, como no web.
- Testes instrumentados de Compose.
- Build de release, assinatura para a loja e publicação na Play Store: até esta spec terminar, o app roda só contra o
  backend local.

## Notas

- O app atual nunca foi publicado, então apagá-lo não afeta ninguém fora do time.
- A spec do web no banco novo e a de tarefa no lugar de evento já anunciavam esta: "o app Android é portado depois do
  web, em spec própria, e até lá não funciona contra esta API".
- Se o web mudar enquanto a reescrita anda, a mudança entra na fase que cobre aquela tela, ou numa linha pendente em
  `docs/mobile-parity.md` se a fase já passou. A regra de paridade do `AGENTS.md` vale desde o primeiro PR.
- Compilar e testar o Kotlin exige JDK 17 ou mais novo e o Android SDK no ambiente.
- Onde esta spec e o web divergem no detalhe, vale o web, e as divergências já levantadas estão listadas em "Onde o ticket e
  o web divergem, vale o web" em `.scratch/android-reconstruido-do-web/issues/README.md` (inclusive a tela cheia do chat, as
  fontes Figtree, Newsreader e JetBrains Mono no lugar de Manrope e Outfit, e a sessão que sobrevive a 5xx na renovação).
