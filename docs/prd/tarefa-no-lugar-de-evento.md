---
status: ready-for-agent
date: 2026-11-15
---

# Spec: tarefa no lugar de evento

Referências: ADRs [0011](../adr/0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md),
[0012](../adr/0012-relacoes-em-tres-tabelas-no-sentido-de-quem-produz.md),
[0013](../adr/0013-ia-sem-tabelas-proprias-e-fila-unica.md) e
[0014](../adr/0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md), o glossário em
[CONTEXT.md](../../CONTEXT.md), a [spec do web no banco novo](./web-no-banco-novo.md) e a regra de paridade em
[mobile-parity.md](../mobile-parity.md).

## Problema

A entidade única de ação, decidida na ADR 0011, se chama **evento**. O nome descreve mal o que ela é. Um evento sugere
algo que acontece num horário, mas a entidade é algo que uma pessoa ou um agente **faz ou vai fazer**: tem executor,
status, prazo, sequência e pode nem ter horário (a tarefa longa, a tarefa sem início). As opções de controle dela
(executor, status, início, fim planejado, sequência) existem para saber qual trabalho será executado e em que
momento. Isso é uma tarefa.

O nome errado aparece em todo lugar: na tela ("Novo evento", "Detalhe do evento", endereços `/eventos/...`), nas
rotas da API, nos contratos, nas tabelas do banco, nas permissões do Auth, nas ferramentas do MCP e nos textos que os
agentes leem. Para piorar, o web já tem uma tela chamada **Tarefas**, que lista eventos acompanhados por status, e o
endereço antigo `/tarefas/:id` redireciona para `/eventos/:id`. Quem usa vê duas palavras para a mesma coisa, e quem
mantém o código lê "event" num lugar e "task" em outro para a mesma entidade.

## Solução

A entidade passa a se chamar **Tarefa** na tela e **Task** no código, em todas as camadas: banco, contratos, pacote
de timeline, API, Auth, MCP, prompts dos agentes e web. A **Agenda** continua sendo a grade de horários: ela mostra as
tarefas que têm início e não são longas. Uma tarefa pode estar na agenda ou não. A tela **Tarefas** continua sendo a
lista das tarefas acompanhadas por status.

A troca é completa e sem estrutura antiga: não ficam redirects de `/eventos`, aliases de tipos, rotas duplicadas na
API, ferramentas antigas no MCP nem permissões `event:*`. O que tinha o nome antigo deixa de existir. Os dados
existentes são preservados: o banco é renomeado no lugar, não recriado.

Para quem usa, nada muda no comportamento. Muda a palavra, o gênero dos textos ("a tarefa", "Nova tarefa", "Tarefa
salva") e os endereços.

## Histórias de usuário

### Na tela

1. Como usuário, quero ver "Tarefa" em todo lugar onde hoje vejo "Evento", para entender que tudo o que eu ou o agente
   fazemos é a mesma coisa.
2. Como usuário, quero criar uma tarefa pelo botão "Nova tarefa", para registrar o que vou fazer.
3. Como usuário, quero que o formulário de criação e de edição fale de tarefa (título da tela, rótulos, botões e
   mensagens), para não ver duas palavras no mesmo fluxo.
4. Como usuário, quero abrir o detalhe de uma tarefa em `/<usuário>/tarefas/<id>`, para que o endereço diga o que estou
   vendo.
5. Como usuário, quero editar uma tarefa em `/<usuário>/tarefas/<id>/editar`, para que o endereço de edição siga o do
   detalhe.
6. Como usuário, quero criar uma tarefa em `/<usuário>/tarefas/nova`, para que o endereço de criação siga os demais.
7. Como usuário, quero que a tela **Tarefas** continue listando as tarefas acompanhadas por status, para não perder o
   que já uso.
8. Como usuário, quero que a **Agenda** mostre as tarefas com horário, de pessoa e de agente, juntas ou por executor,
   para enxergar o meu dia.
9. Como usuário, quero entender que uma tarefa pode estar fora da agenda (sem início, ou longa), para não achar que ela
   sumiu.
10. Como usuário, quero ver "Tarefa de referência" no lugar de "Evento de referência" quando a tarefa não tem status,
    para saber que ela só marca um horário.
11. Como usuário, quero ver "Tarefa longa" no lugar de "Evento longo", para reconhecer o trabalho que fica fora da
    agenda.
12. Como usuário, quero que a sequência leia "Segue-se de" e "Dá sequência a" entre tarefas, para encadear o que
    faço e o que o agente faz.
13. Como usuário, quero que a exclusão diga "Excluir tarefa" e confirme com o texto no feminino, para não estranhar a
    frase.
14. Como usuário, quero que os toasts e as mensagens de erro falem de tarefa ("Tarefa salva", "Tarefa não
    encontrada"), para ter o mesmo vocabulário em todo retorno.
15. Como usuário, quero que os estados vazios falem de tarefa ("Nenhuma tarefa neste dia"), para entender o que
    falta.
16. Como usuário, quero que o título da aba do navegador fale de tarefa, para achar a aba certa.
17. Como usuário de leitor de tela, quero que os rótulos acessíveis falem de tarefa, para ouvir o mesmo que quem vê a
    tela.
18. Como usuário, quero que o botão de voz e o status da gravação falem de tarefa, para saber o que a minha fala vai
    criar.
19. Como usuário, quero que a tarefa de agente (pedido, passo, execução agendada) também apareça como tarefa, para ver
    que o agente faz o mesmo tipo de coisa que eu.
20. Como usuário, quero que o painel do chat e a barra de edição com IA falem de tarefa nas respostas e nos rótulos,
    para conversar com o agente com as mesmas palavras da tela.
21. Como usuário, quero que um endereço antigo `/eventos/...` não abra nada, para que só exista um endereço por
    tarefa.
22. Como usuário, quero que as minhas tarefas, séries, sequências, entradas e tags continuem lá depois da troca, para
    não perder nada.

### Com o agente

23. Como usuário, quero pedir ao Candeia para "criar uma tarefa" e ter a tarefa criada, para falar com ele do jeito
    que a tela fala.
24. Como usuário, quero que o Candeia responda falando de tarefas, para não voltar a ouvir "evento".
25. Como usuário, quero que o agente de consulta responda perguntas sobre as minhas tarefas, para que a troca de nome
    não quebre as consultas.
26. Como agente de entidade, quero instruções e esquemas de saída que falem de tarefa e tarefa recorrente, para gerar
    o lote com os nomes que a API aceita.
27. Como agente de consulta, quero um esquema lógico com tabelas de tarefa, para escrever SQL com os nomes do domínio.
28. Como agente de roteamento, quero ver os agentes de criação e edição de tarefa com nomes de tarefa, para rotear o
    pedido ao agente certo.
29. Como dono, quero que a configuração dos agentes publicada no banco passe a falar de tarefa, com uma nova versão de
    fábrica, para que a versão ativa não fique com o texto antigo.
30. Como dono, quero que a sincronização com o Hermes leve as skills e os agentes com o texto novo, para que o Hermes
    também fale de tarefa.

### Integrações

31. Como cliente do MCP, quero as ferramentas `create_task`, `update_task`, `get_task`, `list_agenda_tasks` e
    `list_tracked_tasks`, para criar e ler tarefas pelo nome do domínio.
32. Como cliente do MCP, quero que as ferramentas antigas `*_event*` deixem de existir, para não haver dois caminhos
    para a mesma coisa.
33. Como cliente da API, quero as rotas em `/api/tasks`, para que a rota diga o recurso.
34. Como cliente da API, quero que `/api/events` responda como rota inexistente, para descobrir cedo que estou no
    contrato antigo.
35. Como cliente da API, quero ler a documentação do Swagger com tags, operações e campos de tarefa, para integrar sem
    adivinhar.
36. Como administrador, quero conceder `task:read`, `task:create`, `task:update` e `task:delete`, para controlar o
    acesso às tarefas pelo nome certo.
37. Como administrador, quero que as permissões `event:*` já concedidas virem `task:*` sozinhas, para ninguém perder
    acesso na troca.
38. Como usuário com acesso negado, quero que o gateway recuse `/api/tasks` pela permissão de tarefa, para que a regra
    de acesso continue valendo.

### Para quem mantém

39. Como desenvolvedor, quero ler `Task`, `TaskDto`, `TaskStatus` e `taskId` no código, para que o nome no código seja
    o nome na tela.
40. Como desenvolvedor, quero que as tabelas e colunas se chamem `tasks`, `task_entries`, `task_tags`,
    `task_task_relation`, `task_artifact_relation`, `from_task_id` e `to_task_id`, para ler o banco sem traduzir.
41. Como desenvolvedor, quero que índices e checks também tenham nome de tarefa, para que um erro de constraint diga a
    entidade certa.
42. Como desenvolvedor, quero que os tipos `Task*` locais que o web tem hoje (status, prioridade e exemplos da lista)
    sejam unificados com os do pacote de contratos, para não haver dois `TaskStatus`.
43. Como desenvolvedor, quero que o pacote de timeline agrupe e posicione tarefas com funções de nome de tarefa, para
    que a agenda use o vocabulário do domínio.
44. Como desenvolvedor, quero um teste que falhe se sobrar "event" ou "evento" de domínio no código, nos textos, nas
    rotas ou no banco, para que a troca não regrida.
45. Como desenvolvedor, quero que os eventos de DOM (`addEventListener`, `KeyboardEvent`, `FormEvent`, parâmetros
    `event` de handler) e o `text/event-stream` fiquem como estão, para não quebrar o que não é a entidade.
46. Como desenvolvedor, quero que a migration renomeie o banco no lugar e reescreva os dados que guardam o nome antigo,
    para que um banco com dados suba na versão nova sem perda.
47. Como desenvolvedor, quero o glossário e uma ADR nova registrando a troca de nome, para que a próxima pessoa não
    volte a "evento".
48. Como agente de código, quero que a skill de entidades e as instruções do repositório falem de tarefa, para gerar
    código com os nomes novos.
49. Como desenvolvedor, quero provisionar uma worktree do zero e ter tudo funcionando com os nomes novos, para validar
    a troca no fluxo real.

## Decisões de implementação

### Vocabulário

- **Tarefa / Task** substitui Evento / Event como nome da entidade única de ação. As decisões de modelo das ADRs
  0011, 0012, 0013 e 0014 não mudam: só o nome.
- Mapa de termos do glossário:

  | Antes | Depois |
  |---|---|
  | Evento | Tarefa |
  | Evento de pessoa / de agente | Tarefa de pessoa / de agente |
  | Evento de referência | Tarefa de referência |
  | Evento longo | Tarefa longa |
  | Evento recorrente | Tarefa recorrente |
  | Sequência entre eventos | Sequência entre tarefas |
  | Agenda | Agenda (sem mudança: grade das tarefas com início que não são longas) |
  | Tela Tarefas | Tela Tarefas (sem mudança: tarefas acompanhadas por status) |

- Pedido, Passo, Execução agendada, Entrada, Relação, Artefato e Sessão continuam com o mesmo nome; as definições
  passam a dizer "tarefa" onde diziam "evento".
- Uma ADR nova (0015) registra a troca e diz que substitui o *nome* usado nas ADRs 0011 e 0014. O glossário remove a
  entrada "tarefa" da lista _Avoid_ de Evento e passa a listar "evento" como termo a evitar para a entidade.
- Os valores de domínio que não carregam o nome da entidade ficam iguais: os tipos (`common`, `meal`, `sleep`,
  `training`, `request`, `search_request`, `build_request`, `inquiry_request`, `review_request`, `cron`, `step`), os
  status, os executores (`human`, `agent`) e os tipos de relação (`precedes`, `step`, `generates`, `updates`,
  `deletes`, `follow_up`).

### Sem estrutura antiga

- Não ficam redirects, aliases de tipo, rotas duplicadas, ferramentas antigas, permissões antigas nem colunas ou
  tabelas com o nome anterior. Um endereço ou rota antiga responde como inexistente.
- Os únicos lugares onde o nome antigo sobrevive são o histórico: as migrations já aplicadas e as ADRs antigas, que
  não são reescritas.

### Banco da API

- Uma migration nova, escrita à mão, renomeia no lugar (sem drop/create) as tabelas: `events` → `tasks`,
  `event_entries` → `task_entries`, `event_tags` → `task_tags`, `event_event_relation` → `task_task_relation`,
  `event_artifact_relation` → `task_artifact_relation`.
- Renomeia as colunas que carregam o nome: `from_event_id` / `to_event_id` → `from_task_id` / `to_task_id`, a coluna
  de referência das entradas, das tags e da relação com artefato, e a coluna `event_id` da fila de jobs.
- Renomeia todos os índices, chaves, checks e uniques com o prefixo antigo (por exemplo, os índices da agenda, das
  tarefas acompanhadas, dos pedidos e da ocorrência única de série).
- Reescreve os dados que guardam o nome antigo:
  - as chaves do template da série (`previousEventIds` e qualquer outra chave com "event") no JSON da recorrência;
  - o nome do agente interno guardado nos dados dos passos (`event-create` → `task-create`, `event-edit` →
    `task-edit`, `recurring-event-create` → `recurring-task-create`, `recurring-event-edit` → `recurring-task-edit`);
  - o tipo e o conteúdo dos jobs ainda na fila que citam esses agentes ou a origem `voice-event` (→ `voice-task`);
  - as chaves de idempotência guardadas para as rotas antigas são descartadas.
- O esquema Drizzle passa a descrever os nomes novos, e o snapshot de metadados fica coerente com a migration, para
  que a próxima geração não proponha recriar as tabelas.
- O esquema lógico que o agente de consulta enxerga passa a ter tabelas e colunas de tarefa, e a reescrita de SQL do
  agente mapeia os nomes lógicos novos para os físicos novos.

### Banco do Auth

- Uma migration no banco do Auth troca o recurso `event` por `task`: reescreve as linhas de permissão de papel e de
  usuário (`event:<ação>` → `task:<ação>`) e troca os checks de formato da permissão para aceitar `task` e não aceitar
  mais `event`. Segue a convenção de migrations do Auth, inclusive o arquivo de reversão.
- Os recursos de acesso passam a ser `task`, `tag`, `artifact`, `recurrence` e `agent`. A política do gateway mapeia
  `/api/tasks` para o recurso `task`.

### Contratos e timeline

- Todos os esquemas, tipos e campos com o nome antigo passam a usar tarefa: o DTO completo, o cartão, o executor, o
  tipo, o status (de pessoa e de agente), a prioridade, a relação com artefato, a série embutida, o pedido, as
  entradas de criação e edição e os vínculos com artefato.
- Os campos `eventId`, `eventIds`, `previousEventIds` e `nextEventIds` passam a `taskId`, `taskIds`,
  `previousTaskIds` e `nextTaskIds`. O lote do agente passa a ter a lista de tarefas e a sequência entre tarefas.
- O pacote de timeline renomeia as funções e tipos de agrupamento por dia, posição na grade, chaves de dia, endereço
  do dia e cartão da agenda para o nome de tarefa.
- Não há reexportação com o nome antigo.

### API

- As rotas passam a ser `GET /api/tasks` (agenda), `GET /api/tasks/tracked`, `GET /api/tasks/:taskId`,
  `POST /api/tasks`, `PATCH /api/tasks/:taskId` e `DELETE /api/tasks/:taskId`. As rotas em `/api/events` deixam de
  existir.
- As features, os use cases, os serviços de domínio (agenda, sequência, mesclagem de edição, montagem de prompt,
  nome de refeição), os gateways, as portas e o kit em memória de testes passam a ter nome de tarefa.
- A documentação OpenAPI passa a usar tags, operações, parâmetros e descrições de tarefa.
- As mensagens de erro que chegam ao cliente falam de tarefa.
- Os agentes de entidade passam a se chamar `task-create`, `task-edit`, `recurring-task-create` e
  `recurring-task-edit`, e os arquivos de instrução deles ganham os nomes e o texto novos. As instruções do roteador,
  do agente de consulta, do fallback e do explicador de falha também passam a falar de tarefa.
- A configuração dos agentes que vive no banco recebe uma nova versão de fábrica com o texto novo, publicada como
  versão ativa, e a sincronização com o Hermes leva essa versão.

### MCP

- As ferramentas passam a ser `create_task`, `update_task`, `get_task`, `list_agenda_tasks` e `list_tracked_tasks`,
  com descrições e parâmetros de tarefa. As ferramentas `*_event*` e `list_timeline_events` deixam de existir.
- As skills do Hermes que citam ferramentas ou o termo antigo são atualizadas na mesma entrega.

### Web

- Rotas da tela: `/<usuário>/tarefas` (lista acompanhada), `/<usuário>/tarefas/nova`, `/<usuário>/tarefas/<id>` e
  `/<usuário>/tarefas/<id>/editar` passam a ser as páginas reais. As rotas `/<usuário>/eventos/...` são removidas, sem
  redirect. As páginas de mockup com o nome antigo são renomeadas como o resto.
- O cliente da API, os hooks e a API falsa dos testes passam a chamar `/api/tasks` e a usar os tipos de tarefa.
- Os módulos de tela passam a ter nome de tarefa: detalhe, linha, glifos, marca de tipo e de prioridade, seletor de
  status, diálogo de exclusão, botão de voz, formulários de criação e tira da semana. O módulo que hoje se chama
  "tasks" (a tela da lista) passa a ter um nome que não colida, como "lista de tarefas".
- Os tipos `Task*` locais da lista e dos controles da agenda (status, prioridade, exemplos) são substituídos pelos
  tipos do pacote de contratos; os rótulos de tela ficam num mapa de visualização com nome próprio.
- Todo texto visível é revisto à mão para o feminino: artigos, adjetivos e particípios ("a tarefa", "Nova tarefa",
  "Tarefa salva", "Tarefa excluída", "Nenhuma tarefa"). Inclui títulos de página, rótulos acessíveis, placeholders,
  toasts, erros, estados vazios e textos calculados da linha.
- A troca de identificadores é feita por símbolo, não por substituição de texto, e deixa intactos os eventos de DOM,
  os parâmetros `event` dos handlers e o `text/event-stream`.

### Documentação e instruções

- Atualizar o glossário, escrever a ADR 0015, atualizar a skill de entidades, a seção de paridade e a documentação de
  agentes que cita evento. O TDD do banco novo e as specs anteriores ganham uma nota apontando para a ADR 0015, sem
  reescrever o histórico.

### Ordem

- A troca começa depois que a branch atual do web no banco novo estiver integrada à `main`, para não brigar com as
  mudanças em andamento.
- Banco, contratos, timeline, API, Auth e MCP mudam juntos, porque compilam e se testam acoplados; o web vem em
  seguida, sobre os contratos novos. Os tickets saem desta spec.

## Decisões de teste

- Um bom teste aqui confere o que sai pelas fronteiras: o que o usuário vê na tela, a rota e o corpo que vão pela
  rede, o que a API responde, o que o banco guarda e o que o gateway e o MCP expõem. Não confere nome de componente,
  nome de arquivo nem ordem de chamada interna. A troca de nomes internos é coberta pela compilação e pela varredura
  de resíduos, não por testes que repetem cada identificador.
- **Costura 1: as telas do web contra a API falsa em memória.** É a costura da spec anterior. A API falsa passa a
  responder só em `/api/tasks` e a validar corpo e resposta contra os esquemas de tarefa. Os testes de tela conferem
  os textos no feminino (criação, detalhe, edição, exclusão, toasts, vazios, rótulos acessíveis) e os endereços
  `/tarefas/...`. Arte anterior: os testes da tela da lista de tarefas, do detalhe, do formulário de edição, da linha,
  dos glifos e do botão de voz.
- **Costura 2: a API pela fronteira HTTP e os testes de integração no Postgres.** Os testes de use case com o kit em
  memória e os de validação de entrada HTTP passam a usar os contratos de tarefa. Os testes de integração de
  persistência (tarefas, cartões, lote do agente, séries, SQL do agente e esquema) rodam contra as tabelas novas. O
  teste do catálogo OpenAPI confere que as operações são de tarefa e que nenhuma rota `/api/events` existe. Arte
  anterior: os testes de criação de evento e de mesclagem de edição, o teste de validação de entrada, os testes de
  integração de persistência e o teste do catálogo OpenAPI.
- **Costura 3: a migration sobre um banco com dados.** Um teste de integração aplica as migrations até a anterior,
  grava tarefas, entradas, tags, sequência, relação com artefato, série com template, passo com agente interno, job
  na fila e chave de idempotência com os nomes antigos, aplica a migration nova e confere que tudo está nas tabelas e
  colunas novas, com as chaves do template, os nomes de agente e os jobs reescritos, e as chaves de idempotência
  descartadas. O mesmo vale para a migration do Auth com permissões `event:*` concedidas. Arte anterior: o teste de
  integração do esquema.
- **Costura 4: a política de rotas do gateway do Auth.** O teste da função que decide recurso e ação a partir do
  método e do caminho passa a esperar `task` para `/api/tasks` e recusa para `/api/events`. Os testes de autorização
  passam a usar `task:*`. Arte anterior: os testes da política do gateway, do roteamento de features e do serviço de
  autorização.
- **Costura 5: a lista de ferramentas do MCP.** O teste do MCP confere que as ferramentas expostas são as de tarefa,
  que as antigas não existem e que cada uma chama a rota `/api/tasks` certa. Arte anterior: o teste do servidor MCP.
- **Costura 6, nova: a varredura de resíduos.** Um teste no nível do repositório falha se encontrar "event" ou
  "evento" como nome da entidade no código e nos textos da API, do web, dos contratos, da timeline, do Auth e do MCP,
  nos prompts dos agentes, no esquema do banco e nas rotas. Ele tem uma lista de exceções explícita e curta: eventos
  de DOM e de teclado, parâmetros `event` de handlers, `text/event-stream`, as migrations já aplicadas e as ADRs
  antigas. Cada exceção nova precisa entrar na lista com um motivo.
- Os testes de contrato do mobile são rodados, como exige o AGENTS.md para mudanças no pacote de contratos, mas
  continuam quebrados até o porte do Android, como a spec anterior já registra.
- A validação final é numa worktree provisionada do zero, com o fluxo de criar, ver, editar e excluir uma tarefa pela
  tela e um pedido ao agente que cria uma tarefa.

## Fora de escopo

- O app Android. A troca de nome nele entra no porte do Android para a API nova, em spec própria. Nesta entrega,
  `docs/mobile-parity.md` registra a troca dentro da exceção já aberta para o banco novo.
- Qualquer mudança de comportamento, de modelo de dados ou de tela além do nome, do gênero dos textos e dos
  endereços.
- Mudar os tipos, os status, os executores ou os tipos de relação.
- Reescrever as migrations já aplicadas ou recriar o banco do zero.
- Reescrever as ADRs antigas; elas ficam como histórico, e a ADR 0015 diz o que mudou.
- A troca de "Hermes" por "Candeia" nos textos visíveis (ADR 0007).
- O nome "Agenda" e o nome da tela "Tarefas", que continuam iguais.

## Notas

- A ADR 0011 rejeitou "tarefa" como nome um dia antes desta spec, porque "tarefa" era a entidade separada que
  deixava de existir. Com essa entidade já removida, o nome fica livre e passa a descrever a entidade única.
- O risco maior é a substituição cega: no web há centenas de usos de `event` que são eventos de DOM. Por isso a troca
  é por símbolo e a varredura tem lista de exceções.
- O segundo risco é o texto em português: "evento" é masculino e "tarefa" é feminino. Cada frase visível precisa de
  revisão de concordância; uma troca automática deixa "o tarefa" e "Tarefa salvo".
- O terceiro risco são os dados que guardam o nome antigo fora das colunas: chaves de JSON da série, nomes de agente
  nos passos, jobs na fila, permissões no Auth e a configuração dos agentes no banco e no volume do Hermes. Todos
  entram na migration ou na nova versão de fábrica.
