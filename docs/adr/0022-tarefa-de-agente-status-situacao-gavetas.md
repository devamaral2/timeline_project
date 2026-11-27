---
status: accepted
date: 2026-11-27
---

# Tarefa de agente: status próprios, situação, gavetas e gaveta de execução

Spec 51. Esta ADR junta as decisões da tarefa de agente na spec; cada ticket acrescenta a sua seção. A primeira é a
dos status de agente, que **substitui o item 3 da ADR 0011** no que diz respeito aos status de agente. Os tipos de
agente e o status de pessoa daquele item continuam valendo. Os projetos têm a ADR 0021.

## Status de agente

### Contexto

Uma tarefa de agente terminava `done` ou `cancel`, os mesmos nomes das tarefas de pessoa. Lendo só o status, não se
sabia quem terminou, e todo lugar que trata `done` precisava perguntar antes quem era o executor. Os seis estados da
execução também não distinguiam o pedido ainda em preparo do que já espera na fila, nem o que abre a sessão do que
trabalha, nem a execução que parou no meio da que falhou.

### Decisão

1. **O conjunto de agente tem dez status e nenhum é igual a um de pessoa:** `preparing`, `queued`, `starting`,
   `running`, `waiting`, `completed`, `interrupted`, `failed`, `cancelled` e `rolled_back`. Os de pessoa não mudam
   (`todo`, `toDefine`, `doing`, `inHold`, `done`, `cancel`, `missed`). O check `tasks_status_matches_actor` continua
   por executor, agora com os dois conjuntos sem valor em comum.
2. **Os grupos moram num lugar só por camada** e são o que as telas e a API perguntam, no lugar de listas soltas:
   - aberto: `preparing`, `queued`, `starting`, `running`, `waiting`;
   - em andamento: `preparing`, `queued`, `starting`, `running`;
   - final: `completed`, `interrupted`, `failed`, `cancelled`, `rolled_back`;
   - sucesso: `completed`.
   Estão em `apps/api/src/domain/agent-status.ts`, `packages/contracts/src/tasks/agent-status-groups.ts` (web) e
   `domain/task/AgentStatusGroups.kt` (Android). O MCP não depende dos contratos e guarda a sua cópia da lista no filtro
   de `list_tracked_tasks`.
3. **O passo usa o mesmo conjunto**, sem `waiting`. Os mapas entre status de passo e status de rastro seguem: `completed`
   vira `done`; `failed`, `cancelled`, `interrupted` e `rolled_back` viram `failed`; `preparing`, `queued` e `starting`
   viram `pending`. O status do job, o do rastro, o da geração de alimento e o da execução no Hermes não mudam: não são
   status de tarefa.
4. **Onde a API gravava `done` e `cancel` de uma tarefa de agente, grava `completed` e `cancelled`.** Os momentos em que
   cada status é gravado estão na tabela "Significado e quem grava", abaixo.
5. **Uma migration** (`0010_status_de_agente_proprios`) tira o check, troca os valores nas tarefas de agente (pedidos e
   passos) e recoloca o check, tudo na mesma transação. As tarefas de pessoa não são tocadas. Os pedidos que já existem
   continuam na lista: os concluídos como "Concluído" e os cancelados como "Cancelado".
6. **Os contratos recusam o status de um executor no outro:** o esquema do cartão da tarefa rejeita um cartão de agente
   com `done` ou `cancel` e um de pessoa com status de agente.
7. **Os nomes na tela:** "Preparando", "Na fila", "Iniciando", "Trabalhando", "Esperando", "Concluído", "Interrompido",
   "Falhou", "Cancelado" e "Revertido"; o nome acessível é "Agente, " e o nome em minúscula ("Agente, concluído"). Um
   pedido `cancelled` mostra "Pedido cancelado" e um `interrupted` mostra "Pedido interrompido". Os ícones quadrados
   próprios vêm com a linha da tarefa de agente; até lá o glifo é o de hoje, reaproveitado.
8. **Lembretes, subtarefas e fração:** o lembrete de uma tarefa de agente se cala em qualquer status final e o de pessoa
   continua em `done` e `cancel`; a subtarefa de agente fechada é a de status final; a fração conta `done` de pessoa e
   `completed` de agente.

### Significado e quem grava

Quem grava é sempre a API, e só no pedido ou no passo, de onde a tabela de transições (`canTransitionAgentStatus`,
`apps/api/src/domain/agent-status.ts`) deixa chegar ao status novo. Uma gravação fora da lista é recusada (o pedido
continua onde estava), e um status final não volta a ficar aberto: ele só segue para `rolled_back`. `finished_at` é
gravado em todo status final.

| Status | Significa | Quem grava |
|---|---|---|
| `preparing` | O pedido chegou e ainda não tem destino: o agente de roteamento (ou o worker da edição por alvo) decide. | O pedido que passa pelo roteamento (`POST /api/requests`) e a edição por alvo (`/edit`) nascem assim. |
| `queued` | Tem destino e espera um worker. | O pedido que já nasce com destino (Hermes, modo modelo, voz, cálculo de alimento) e o roteamento, quando entrega o pedido ao Hermes ou ao modo modelo (`handToHermes`, `handToModel`). Os passos nascem assim. |
| `starting` | Um worker pegou o job e ainda não chamou o executor. | O worker do turno (Hermes, modelo, voz, alimento) ao pegar o job (`markStarting`). |
| `running` | O executor está trabalhando. | O worker do turno na primeira chamada ao executor (`markRunning`); o roteamento e a edição por alvo, ao desdobrar o pedido em passos (`beginSteps`); o passo, ao começar (`markStepRunning`). |
| `waiting` | Espera alguém. | Ninguém ainda. |
| `completed` | Terminou bem. | O finalizador (todos os passos), o worker do turno e o fim do cálculo de alimento; o passo, ao gravar o resultado. |
| `interrupted` | Parou no meio, sem terminar nem falhar. | O cancelamento de um pedido ou passo `running`; a execução que o Hermes devolve como cancelada ou interrompida; o job abandonado porque o worker morreu e as tentativas acabaram (`WorkerAttemptsExhaustedError`). |
| `failed` | O executor falhou, ou o pedido não pôde começar. | O erro devolvido pelo executor (worker do turno, passo, finalizador quando todos os passos falham), o job que morreu por erro e o job abandonado cujo pedido ainda não rodava. |
| `cancelled` | O usuário cancelou antes de o trabalho começar. | O cancelamento de um pedido ou passo `preparing`, `queued`, `starting` ou `waiting`. |
| `rolled_back` | O que o pedido fez foi desfeito. | Ninguém ainda. |

Transições aceitas:

```
preparing -> queued | running | failed | cancelled
queued    -> starting | running | failed | cancelled
starting  -> running | failed | cancelled
running   -> waiting | completed | failed | interrupted
waiting   -> running | failed | cancelled
completed | interrupted | failed -> rolled_back
```

Cancelar um pedido deixa `cancelled` ou `interrupted` conforme ele estava, e os passos seguem a mesma regra (o `queued`
vira `cancelled`, o `running` vira `interrupted`); o código de erro do pedido é `cancelled` nos dois casos. Uma nova
tentativa do worker acha o pedido onde a anterior parou (`queued`, `starting` ou `running`) e continua. Os workers aceitam
só esses três (`TURN_AGENT_STATUSES`); o roteamento e a edição por alvo aceitam só `preparing`, para que uma nova tentativa
depois da entrega não despache de novo.

### Alternativas rejeitadas

- Manter `done` e `cancel` nos dois conjuntos e distinguir pelo `actor`: todo lugar continuaria precisando perguntar o
  executor.
- Renomear também o status do job e o do rastro: não são status de tarefa e outros consumidores os leem.

### Consequências

- O app Android precisa ser publicado junto com a API. O app antigo falhava ao ler um status que não conhecia; o novo lê
  um status desconhecido como neutro, sem derrubar o cartão.
- Quem entrar depois com um status de agente novo (como `awaiting_transcription`, das issues 39 e 40) decide entre usar
  `queued` e acrescentá-lo ao conjunto e aos grupos, com nome, ícone e cor.

## Situação

### Contexto

O status diz como a execução terminou; não diz o que o usuário fez com o resultado. Sem isso, um pedido concluído de
ontem e um que acabou de terminar são iguais na lista, e quem quer deixar um resultado de lado ou guardá-lo para depois
não tem onde marcar.

### Decisão

1. **A tarefa de agente que termina ganha uma situação, que o usuário controla:** `to_review` (Para revisar),
   `reviewed` (Revisada) ou `bookmarked` (Guardada). A coluna `tasks.situation` é texto e opcional; o nome nos contratos
   é o mesmo (`TaskSituation`, `situation` no cartão da tarefa e no pedido).
2. **Quem pode ter situação** é o pedido de agente que não é passo nem execução agendada e está num status final. O
   domínio (`acceptsSituation`, no mesmo módulo dos grupos de status) e dois checks do banco impõem isso:
   `tasks_situation_valid` (um dos três valores) e `tasks_situation_shape` (só agente, só fora de `step` e `cron`, só em
   status final). O check vale **só num sentido**: uma tarefa final pode ficar sem situação. Assim, restringir a política
   de revisão depois não pede migration.
3. **A política de revisão mora num lugar só** (`REVIEW_SITUATION_ON_CLOSE`, em `domain/agent-status.ts`): a gravação que
   fecha um pedido, em qualquer status final, grava `to_review` na mesma operação. São três gravações, todas passam por
   ela: o fechamento do pedido (`closeRequest`, que cobre `completed` e `failed`), o cancelamento do pedido (`cancel`) e
   o fechamento do pedido de cálculo de alimento. Os passos nunca ganham situação. Quem passar a gravar `interrupted`
   (ticket 56) fecha o pedido pelas mesmas gravações e herda a política.
4. **Definir a situação** é `PUT /api/tasks/:taskId/situation` com `{ situation }`, e devolve o cartão da tarefa.
   Aceita qualquer um dos três valores a partir de qualquer um deles, não usa `expectedRevision` (a tarefa de agente não
   é editada por formulário, vale a última gravação) e responde 404 para tarefa inexistente ou de outro usuário (os dois
   casos iguais) e 409 quando a tarefa não aceita situação (de pessoa, passo, execução agendada ou ainda aberta). A
   gravação confere o critério de novo no próprio `UPDATE`, porque o status pode ter mudado desde a leitura. A mudança
   sobe a `revision` e o `updated_at` da tarefa. A rota está no catálogo de rotas da API.
5. **A migration** `0011_situacao_da_tarefa_de_agente` acrescenta a coluna e os dois checks e grava `reviewed` nas tarefas
   de agente que já estão num status final e não são passo nem execução agendada: o que terminou antes desta mudança
   nunca foi mostrado ao usuário como "para revisar", então não entra na fila de revisão. As abertas e os passos ficam
   sem situação.

   Esta mudança chega em três migrations (0009 para o projeto, 0010 e 0011 para os status e a situação), e não em uma.
   A entrega continua atômica: o migrador do Drizzle aplica todas as pendentes dentro de uma transação só, então ou
   entram as três, ou nenhuma.
6. **No web:** na linha da tarefa de agente que tem situação, o glifo da esquerda mostra a situação (Para revisar é o
   círculo vazio de "A fazer", em cor apagada; Revisada, um círculo com dois vistos, em sucesso; Guardada, um marcador,
   na cor de informação, o azul de `--routine`) e abre as três opções na própria linha. A mudança aparece na hora e é
   desfeita se a gravação falhar. Na tarefa de agente `waiting` e na execução agendada o glifo é um ponto inerte. O
   cabeçalho do detalhe do pedido terminado ganha o mesmo controle. A lista continua agrupando como antes: as quatro
   gavetas vêm com a regra das gavetas, e o status continua onde é desenhado, até o ticket do ícone quadrado o levar
   para a direita.

### Alternativas rejeitadas

- Um status a mais (`reviewed`) no conjunto de agente: misturaria o resultado da execução com a decisão do usuário e
  tornaria `completed` ambíguo para os lembretes, a fração e os grupos.
- Gravar `to_review` na migration para o que já terminou: encheria a fila de revisão com o histórico inteiro no primeiro
  acesso.
- Exigir `expectedRevision` na troca: a situação não é um campo editado por formulário, e duas telas trocando-a deixam a
  última valer sem perder nada.

### Consequências

- O Android recebe `situation` no cartão e no pedido e ignora o campo até o ticket do Android; a linha de paridade
  fica pendente.
- Os clientes não escrevem a lista de status finais para decidir se mostram o controle: o cartão só traz `situation` quando
  a tarefa aceita.

## A linha da tarefa de agente

### Decisão

1. **O status sai da esquerda e vai para o canto direito da linha:** o nome do status à esquerda do ícone quadrado e,
   abaixo do ícone, o símbolo do provedor que rodou a tarefa, só quando o pedido levou a escolha. O robô que fechava a
   linha saiu. O status do agente não abre escolha nenhuma. À esquerda fica um ponto inerte, o lugar do controle de
   situação.
2. **Cada status tem um ícone quadrado, um SVG só na grade de 20:** quadrado de canto arredondado (18 de lado, raio 5,
   traço 1,6) e o desenho de dentro centrado em (10, 10). Não são bordas nem pseudo-elementos de CSS, que o navegador
   arredonda e tira do centro. As cores são tokens (apagada, destaque, aviso, sucesso, erro); o giro de `starting` e o
   pulso de `running` param com `prefers-reduced-motion`. O ícone é o mesmo na lista, na agenda, no cabeçalho do detalhe,
   nos passos e na gaveta de subtarefas.
3. **O cartão da tarefa de agente traz `model` (provedor, modelo e esforço)** quando o pedido levou a escolha, lida de
   `tasks.data.model`. No Hermes, que responde com o modelo dele, e na tarefa de pessoa o campo não vai, como no
   `RequestDto`. A lista só desenha o símbolo do provedor.

## A gaveta de execução

### Contexto

O que o agente está fazendo agora só aparecia dentro da lista de tarefas. Na Agenda e nos Documentos não havia sinal de
que algo rodava, e a execução em andamento não pertence a nenhuma gaveta da lista (ela ainda não pede ação).

### Decisão

1. **Mora no shell, junto da barra inferior** (`components/shell/execution-drawer.tsx`, montada por `AppShell`), e não em
   cada tela: o estado dela (altura, leitura) sobrevive à troca de aba. Existe nas três abas e não existe no detalhe, na
   edição, na criação nem com o chat aberto (a rota decide pelo caminho; o chat a esconde sem desmontá-la). Sem usuário
   (telas de mockup) não existe. No desktop, onde não há barra inferior, fica presa ao pé da coluna de conteúdo, com a
   largura dela.
2. **O que mostra:** as tarefas de agente em andamento (grupo `IN_PROGRESS_AGENT_STATUSES` dos contratos, nunca uma lista
   solta) que não são passo nem execução agendada (`cron`), da mais recente para a mais antiga pelo início. A API só
   devolve passo fora da lista acompanhada; a execução agendada é descartada no cliente. Sem nenhuma, não é desenhada.
3. **Três alturas**, escolhidas pela pessoa e guardadas no aparelho (`braid-execution-drawer`, valem em todas as abas;
   padrão três): uma linha de 44 px (a execução mais recente, com a seta para cima e o "+N" das demais), três linhas de
   40 px sob um cabeçalho de 44 px, ou todas (passando de 60% da altura da tela a lista rola por dentro). Tocar no
   cabeçalho alterna três e todas, a seta dupla recolhe a uma linha e tocar na linha recolhida volta a três.
4. **Movimento:** abrir leva 420 ms em `cubic-bezier(.22, 1, .36, 1)` e fechar 300 ms em `cubic-bezier(.5, 0, .2, 1)`.
   As linhas que entram sobem 8 px e ganham opacidade, uma depois da outra (40 ms de intervalo), e só ao crescer.
   Com `prefers-reduced-motion` a altura muda de uma vez. As linhas escondidas ficam `inert` e `aria-hidden`; o cabeçalho
   diz `aria-expanded`.
5. **A tela por baixo reserva o fim:** um espaçador no fluxo, depois do conteúdo, tem a mesma altura da gaveta e anima
   com as mesmas curvas, de modo que a última linha da lista, da agenda ou dos documentos nunca fica coberta. A altura é
   calculada em CSS a partir do número de linhas à mostra (`--exec-rows`) e do modo.
6. **Leitura:** `GET /api/tasks/tracked` com `actor=agent` e os status em andamento, a cada 3 s (o intervalo das listas,
   `useOpenAgentRefresh`) enquanto houver alguma. Parada, relê quando a janela volta ao foco, logo depois de o próprio
   cliente abrir um pedido (`REQUEST_STARTED_SIGNAL`, avisado pelas funções de `lib/api/requests.ts`) e a cada 30 s. Não há
   canal de empurrão: a releitura é o único meio. A Lista de tarefas e a Agenda continuam relendo enquanto têm tarefa de
   agente aberta, e por isso a execução que termina sai da gaveta e entra na gaveta certa da lista no mesmo ciclo.

### Alternativas rejeitadas

- Uma faixa no alto de cada tela: ocupa o espaço de leitura e teria de ser repetida em três telas.
- Guardar a altura por aba: a pessoa escolhe uma vez quanto espaço quer dar às execuções.
- Reservar o espaço no fim com um valor fixo: a altura muda a cada toque, e a última linha ficaria coberta ou
  sobraria vão.

### Consequências

- A execução em andamento aparece só na gaveta de execução: a lista de tarefas a tira (seção seguinte).
- O que fica fixo no pé da tela (a escolha de status da lista) sobe a altura que a gaveta cobre: `ExecutionDrawer`
  publica `--execution-clearance` na raiz do documento (da borda de cima da gaveta até o pé da janela, acompanhando a
  altura enquanto ela anima) e o CSS usa `max(base, var(--execution-clearance, 0px) + 12px)`. Sem gaveta à vista a
  variável não existe e vale a base de sempre (24 px, ou 90 px no celular, acima da barra).
- O Android tem a mesma gaveta (ticket 67), no `AppNavHost`: a altura fica no DataStore, o aviso de pedido aberto é o
  `RequestStarted` (emitido pelos repositórios de pedido e de chat) e cada tela reserva o fim da rolagem com o
  `ExecutionReserveSpacer`, que lê a altura animada da gaveta na fase de layout.

## As quatro gavetas da lista

### Contexto

A lista de tarefas agrupava por status em seis grupos (Em curso, A fazer, Sem data, Em espera, Feitas, Encerradas). Com
os status e a situação do agente, o que importa na lista é a ação que a tarefa pede, e o trabalho que o agente ainda faz
já tem a gaveta de execução. "Gaveta" aqui é a **gaveta da lista**; a gaveta de subtarefas (ADR 0017) e a gaveta de
execução são outras coisas.

### Decisão

1. **Quatro gavetas, nesta ordem:** Para agora, Contínuas, Para depois e Finalizadas. O cabeçalho é o divisor em mono que a
   lista já usa (seta, título, contagem e o fio) e abre e fecha a gaveta; Para agora e Contínuas começam abertas, as
   outras fechadas, e a gaveta vazia não é desenhada. O resumo no alto é "N tarefas para agora".
2. **A regra** é uma função pura, `drawerOf` em `lib/tasks/task-drawers.ts`:
   - Execução agendada (`cron`): Contínuas, com qualquer status.
   - Pedido de agente em andamento (`IN_PROGRESS_AGENT_STATUSES` dos contratos): fora da lista (`execution`), só na gaveta
     de execução. Esperando você (aberto e não em andamento): Para agora.
   - Pedido de agente que terminou: pela situação (Para revisar: Para agora; Guardada: Para depois; Revisada:
     Finalizadas); sem situação (passo, ou dado de antes da situação): Finalizadas.
   - Tarefa longa de pessoa que não acabou (`isClosedStatus`): Contínuas. Os demais status de pessoa: A fazer e Em curso em
     Para agora; Sem data e Em espera em Para depois; Feito, Cancelado e Não realizado em Finalizadas.
   - Sem status (referência): sem gaveta.
3. **A ordem:** em cada gaveta vêm primeiro as tarefas de pessoa e depois as de agente, cada grupo na ordem em que a API
   devolve. Mudar a situação de uma tarefa de agente a leva para a outra gaveta na hora, sem reler (a lista é derivada
   do cartão, e a troca otimista da situação já muda o cartão).
4. **Subtarefas** continuam dentro da principal (ADR 0017). O que está em andamento sai da lista antes do aninhamento
   (`listedCards`), então a subtarefa cuja principal está em andamento continua como linha. A fração conta como feita a
   tarefa de pessoa `done` e a de agente `completed` (`countsAsDone`).
5. **O filtro por executor e os modos de visualização** seguem como estavam: são parâmetros da consulta.
6. **O Android** porta a regra em `domain/task/TaskDrawers.kt` (`drawerOf`, `listedCards`, `drawersOf`, `toNowLabel`), sobre
   os grupos de `AgentStatusGroups.kt`, e a confere contra o fixture `task-list-drawers` (a tabela da regra, a lista em
   gavetas, o resumo e as mudanças de situação), gerado pelas mesmas funções do web (`TaskDrawersTest`). A troca de situação
   no `TasksViewModel` muda a linha de gaveta na hora. A função antiga (`groupTrackedTasks`, seis grupos por status) saiu do
   web e do Android, e o fixture de grupos com ela (`task-list-pipeline` virou `task-list-rules`, sem os grupos).

### Alternativas rejeitadas

- Manter os seis grupos e acrescentar a execução como grupo: o estado "rodando" pertence à gaveta de execução, não à
  lista, e o grupo antigo misturava o que pede ação com o que já passou.
- Uma gaveta por situação: Para revisar já é trabalho para agora, e Guardada e Para depois pedem a mesma coisa (nada agora).

### Consequências

- A tela só mostra as gavetas com tarefa; uma lista em que tudo está em andamento mostra o aviso de lista vazia, e o
  trabalho aparece na gaveta de execução.
