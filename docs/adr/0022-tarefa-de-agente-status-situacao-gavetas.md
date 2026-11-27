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
4. **Onde a API grava `done` e `cancel` de uma tarefa de agente, grava `completed` e `cancelled`.** Esta etapa só troca os
   nomes: os momentos em que a API grava um status não mudam, e `preparing`, `starting`, `interrupted` e `rolled_back`
   são aceitos e desenhados, mas ninguém os grava ainda.
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

### Alternativas rejeitadas

- Manter `done` e `cancel` nos dois conjuntos e distinguir pelo `actor`: todo lugar continuaria precisando perguntar o
  executor.
- Renomear também o status do job e o do rastro: não são status de tarefa e outros consumidores os leem.

### Consequências

- O app Android precisa ser publicado junto com a API. O app antigo falhava ao ler um status que não conhecia; o novo lê
  um status desconhecido como neutro, sem derrubar o cartão.
- Quem entrar depois com um status de agente novo (como `awaiting_transcription`, das issues 39 e 40) decide entre usar
  `queued` e acrescentá-lo ao conjunto e aos grupos, com nome, ícone e cor.

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
   cliente abrir um pedido (`REQUEST_STARTED_EVENT`, avisado pelas funções de `lib/api/requests.ts`) e a cada 30 s. Não há
   canal de empurrão: a releitura é o único meio. A Lista de tarefas e a Agenda continuam relendo enquanto têm tarefa de
   agente aberta, e por isso a execução que termina sai da gaveta e entra na gaveta certa da lista no mesmo ciclo.

### Alternativas rejeitadas

- Uma faixa no alto de cada tela: ocupa o espaço de leitura e teria de ser repetida em três telas.
- Guardar a altura por aba: a pessoa escolhe uma vez quanto espaço quer dar às execuções.
- Reservar o espaço no fim com um valor fixo: a altura muda a cada toque, e a última linha ficaria coberta ou
  sobraria vão.

### Consequências

- Enquanto as quatro gavetas da lista não entram, a execução em andamento aparece na gaveta de execução e também na
  lista de tarefas. É esperado.
- O Android ganha a mesma gaveta em ticket próprio (spec 51).
