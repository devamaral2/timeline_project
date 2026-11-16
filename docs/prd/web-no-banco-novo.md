---
status: ready-for-agent
date: 2026-11-14
---

# Spec: o web sobre a API do banco novo

Referências: [TDD do banco novo](../tdd/novo-banco-de-dados.md), ADRs
[0005](../adr/0005-skills-e-agentes-do-hermes-como-arquivos.md),
[0006](../adr/0006-edicao-por-alvo-pela-rota-por-processo.md),
[0011](../adr/0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md),
[0012](../adr/0012-relacoes-em-tres-tabelas-no-sentido-de-quem-produz.md) e
[0013](../adr/0013-ia-sem-tabelas-proprias-e-fila-unica.md), o glossário em [CONTEXT.md](../../CONTEXT.md) e o canvas
de desenho [Entidade única — agenda e tarefas](https://claude.ai/artifact/JyY9he8CQyMFdKfigLiwkR), que é a referência
visual desta spec. A documentação das rotas está em `/docs` da API (Swagger).

## Problema

A API já roda sobre o banco novo: um evento único, com executor (pessoa ou agente), o artefato no lugar da nota e o
pedido ao agente no lugar do processo e do job de IA. O web continua falando os contratos antigos. Ele chama rotas que
não existem mais (tarefas, notas, processo de IA, job de IA, automação e evento por voz) e lê os campos que ficaram
com outro nome ou outro sentido. O gateway do Auth, por sua vez, não deixa passar as rotas de artefatos nem as de
pedidos.

Para quem usa, o resultado é que o web não funciona contra esta API: a lista de tarefas não carrega, as notas não
abrem, o chat não envia, a fala não vira evento. E, mesmo onde carrega, a tela não mostra o que o modelo novo trouxe:
os eventos do agente ao lado dos seus, o evento de referência, o evento longo, as relações entre eventos e artefatos.

## Solução

O web passa a falar só a API nova e a mostrar o evento único como o canvas desenhou.

- A lista de tarefas e a agenda usam a mesma linha: glifo de status à esquerda, título, ícone e código do tipo, o
  "quando" e a duração. O evento de pessoa fica solto no fundo da tela; o evento de agente ganha um cartão verde-água.
- O detalhe do evento tem três formas: leitura e edição para o evento de pessoa, e uma própria para o evento de
  agente, com entradas, passos, o que ele produziu e a sessão.
- A aba Notas passa a listar artefatos. "Nota" fica como rótulo de tela do artefato de texto.
- O chat, a barra de edição com IA e o botão de voz continuam como estão na tela, mas abrem e acompanham pedidos.
- A agenda e a lista de tarefas ganham três modos de visualização (os seus eventos, os dos agentes, todos), trocados
  por um menu que sobe da aba já selecionada.
- O gateway passa a reconhecer as rotas de artefatos e de pedidos.

Ao fim, o web não chama mais nenhuma rota antiga, e nenhuma rota da API fica sem consumidor.

## Histórias de usuário

### Lista de tarefas

1. Como usuário, quero ver na lista de tarefas todos os eventos com status, com ou sem data, para acompanhar o que
   está em aberto.
2. Como usuário, quero os eventos agrupados em Em curso, A fazer, Sem data, Em espera e Feitas, para saber o que
   pede atenção agora.
3. Como usuário, quero que Feitas venha recolhido e com a contagem, para a lista aberta não ficar longa.
4. Como usuário, quero ver os pedidos e as execuções agendadas do agente na mesma lista, em cartões verde-água, para
   saber o que ele está fazendo por mim.
5. Como usuário, quero que cada linha mostre o ícone e o código do tipo (`meal`, `cron`, `search_request`), para
   reconhecer o tipo sem abrir o evento.
6. Como usuário, quero ver o "quando" de cada linha no formato certo para o caso (hoje com hora, só o dia, o prazo, a
   regra da série, "há 12 min"), para ler a lista sem interpretar datas.
7. Como usuário, quero que um evento a fazer cujo dia já passou apareça como "Era ontem" ou atrasado, para notar o
   que ficou para trás.
8. Como usuário, quero ver o evento longo com o prazo ("Prazo 30 nov") e, com o prazo vencido, como atrasado, para
   acompanhar projetos que não cabem num dia.
9. Como usuário, quero que uma série apareça uma vez só na lista, pela próxima ocorrência em aberto e com a regra no
   lugar do horário, para não ver a mesma tarefa repetida.
10. ~~Fração de subtarefas ("1/3").~~ Removida: não há mais subtarefa ([ADR 0014](../adr/0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md)).
11. ~~"Espera por 1 evento".~~ Removida: a sequência é só informativa ([ADR 0014](../adr/0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md)).
12. Como usuário, quero ver as tags e a duração planejada na linha, para decidir o que cabe no meu tempo.
13. Como usuário, quero concluir e reabrir um evento pelo glifo de status, sem abrir o detalhe, para marcar rápido.
14. Como usuário, quero que o glifo de status nunca fique dentro de uma moldura, para a lista ficar leve.
15. Como usuário, quero filtrar a lista por tag, por prioridade e por texto, para achar um evento.
16. Como usuário, quero que os pedidos em andamento se atualizem sozinhos na lista, para ver quando o agente
    termina.
17. Como usuário, quero que um pedido que aguarda a minha resposta apareça em Em espera com "aguarda sua resposta",
    para eu saber que a vez é minha.

### Agenda

18. Como usuário, quero ver na agenda os eventos do dia em ordem de horário, os meus e os do agente juntos, para ter
    o dia inteiro num lugar.
19. Como usuário, quero ver cada ocorrência de uma série no seu dia, para a agenda refletir o que de fato acontece.
20. Como usuário, quero que o evento de referência apareça com o ponto azul ("Só agenda"), para distinguir o que só
    marca horário do que eu acompanho.
21. Como usuário, quero que o evento marcado como não realizado mostre "Não realizado", para registrar o que não
    aconteceu.
22. Como usuário, quero que eventos longos e passos fiquem fora da agenda, para a grade só ter o que tem horário.
23. Como usuário, quero continuar vendo as janelas livres e criar um evento a partir de uma delas, para aproveitar o
    tempo vago.
24. Como usuário, quero que os eventos do agente não ocupem as minhas janelas livres, para a conta de tempo livre
    ser só minha.
25. Como usuário, quero que a agenda não repita o dia num título, já que a tira da semana o mostra, para ganhar
    espaço.
26. Como usuário, quero dar a um evento de referência um status a qualquer momento, para passar a acompanhá-lo.
27. Como usuário, quero continuar recebendo os avisos antes dos eventos, calculados a partir da agenda e da lista de
    tarefas, para não perder horários.

### Detalhe do evento de pessoa: leitura

28. Como usuário, quero abrir um evento, vindo da agenda ou da lista de tarefas, na mesma tela de detalhe, para não
    ter duas telas para a mesma coisa.
29. Como usuário, quero ver no topo o tipo, o título, o status e a prioridade, e trocar status e prioridade ali
    mesmo, para agir sem entrar em edição.
30. Como usuário, quero uma seção "Informações" com início, fim planejado, duração, tarefa persistente, recorrência,
    lembretes e tags em texto simples, para ler o evento de uma vez.
31. Como usuário, quero ver os lembretes como "Lembrar antes de" com cartões pequenos ("30 min", "1 dia"), para saber
    quando serei avisado.
32. ~~Subtarefas no detalhe, com status.~~ Removida ([ADR 0014](../adr/0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md)).
33. Como usuário, quero ver a sequência do evento nos dois sentidos ("Segue-se de" e "Da sequência a"), com eventos de
    pessoa e de agente, para entender o que veio antes e o que vem depois.
34. Como usuário, quero ver os artefatos do evento na ordem da lista, com o tipo, de quem são (seu ou catálogo
    global) e a relação (`uses`, `creates`), para saber o que o evento usa e o que ele produziu.
35. Como usuário, quero ver por qual pedido o evento foi gerado, quando houver, para chegar à origem.
36. Como usuário, quero ver no Registro de um pedido ou de um artefato só a criação e a última alteração, para não
    ler dados técnicos.
37. Como usuário, quero pedir uma edição ao agente pelo campo no rodapé do detalhe, falando ou escrevendo, para
    mudar o evento sem preencher formulário.
38. Como usuário, quero apagar o evento pelo menu "Mais ações", para remover o que não vale mais.

### Detalhe do evento de pessoa: edição e criação

39. Como usuário, quero um modo de edição em que cada campo é um campo de entrada, para corrigir qualquer coisa.
40. Como usuário, quero só Descartar e Salvar no rodapé da edição, para a saída ser clara.
41. Como usuário, quero trocar o tipo entre `common`, `meal`, `sleep` e `training`, para classificar o evento.
42. Como usuário, quero definir início e fim planejado com data e hora, ou deixar o evento sem data, para planejar
    do meu jeito.
43. Como usuário, quero marcar um evento como tarefa persistente e dar a ele um prazo, para tratá-lo como evento
    longo.
44. Como usuário, quero criar, alterar e encerrar a recorrência de um evento, e saber se a ocorrência aberta segue a
    série ou foi destacada dela, para controlar o que se repete.
45. Como usuário, quero adicionar e remover lembretes e tags, com sugestão de tags enquanto digito, para organizar.
46. ~~Criar, renomear e remover subtarefas na edição.~~ Removida ([ADR 0014](../adr/0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md)).
47. Como usuário, quero buscar outro evento, de pessoa ou de agente, para pôr na minha sequência nos dois sentidos, para
    encadear o que acontece (por exemplo, a revisão de um erro e o conserto que o agente faz depois).
48. Como usuário, quero buscar um artefato para ligar ao evento, reordenar a lista e remover uma ligação, para
    montar o que o evento usa.
49. Como usuário, quero adicionar a uma refeição um alimento do catálogo global ou dos meus, com a quantidade, para
    registrar o que comi sem que editar o original mude o passado.
50. Como usuário, quero adicionar a um treino os exercícios do catálogo global, na ordem, para montar a ficha.
51. Como usuário, quero criar um evento novo com o mesmo formulário da edição, com ou sem status, para ter um só
    jeito de criar tarefa e evento.
52. Como usuário, quero ser avisado quando o evento mudou em outro lugar enquanto eu editava, e recarregar antes de
    salvar de novo, para não apagar a alteração de outra tela ou do agente.
53. Como usuário, quero que um toque repetido em Salvar não crie dois eventos, para não duplicar por engano.

### Detalhe do evento de agente

54. Como usuário, quero abrir um pedido ou uma execução agendada e ver o status, o início, a conclusão e quantos
    passos já foram feitos, para acompanhar o trabalho.
55. Como usuário, quero ler as entradas do pedido em ordem (mensagem, pensamento, trace, insumo, resultado), para
    entender o que o agente fez e por quê.
56. Como usuário, quero ver os passos com o agente interno e o status de cada um, sem poder editá-los, para saber
    onde o pedido está.
57. Como usuário, quero ver o que o pedido produziu, artefatos e eventos, e abrir cada um, para chegar ao resultado.
58. Como usuário, quero ver de qual pedido este continua, para seguir a sessão.
59. Como usuário, quero cancelar um pedido em andamento pela linha de status do campo do agente, para interromper o
    que não quero mais.
60. Como usuário, quero ver o motivo quando um pedido falha, para decidir se peço de novo.
61. Como usuário, quero continuar a conversa de um pedido pelo campo no rodapé, para refinar o resultado.
62. Como usuário, quero que o detalhe de um pedido em andamento se atualize sozinho, para ver os passos avançando.

### Artefatos (aba Notas)

63. Como usuário, quero ver os meus artefatos na aba Notas, do mais recente para o mais antigo e sem as cópias
    derivadas, para achar o que escrevi e registrei.
64. Como usuário, quero filtrar os artefatos por tipo, por tag e por texto, para chegar ao que procuro.
65. Como usuário, quero criar e editar uma nota de texto, para guardar conteúdo.
66. Como usuário, quero criar um alimento descrevendo o que comi e acompanhar o cálculo de calorias até terminar,
    para não preencher nutrientes à mão.
67. Como usuário, quero ver no detalhe de um artefato em quais eventos ele aparece e com que relação, para saber
    onde foi usado.
68. Como usuário, quero apagar um artefato, para limpar o que não uso.
69. Como usuário, quero pedir ao agente uma edição do artefato aberto, para mudar o conteúdo por texto ou voz.
70. Como usuário, quero ser avisado quando o artefato mudou em outro lugar enquanto eu editava, para não perder
    alterações.
71. Como usuário, quero que os artefatos globais apareçam como "catálogo global" e não possam ser editados, para
    não esperar poder mudar o que é de todos.

### Pedidos ao agente: chat, voz e arquivos

72. Como usuário, quero mandar um pedido pelo chat e ver os passos, o que foi criado ou alterado e a resposta, para
    a tela do chat continuar como é.
73. Como usuário, quero que a mensagem seguinte continue a mesma sessão, para o agente lembrar do assunto.
74. Como usuário, quero que reenviar uma mensagem depois de uma falha de rede não a mande duas vezes, para não
    duplicar o trabalho.
75. Como usuário, quero reencontrar os pedidos em aberto ao recarregar a página, para não perder o resultado de um
    pedido que ainda rodava.
76. Como usuário, quero falar um evento e vê-lo aparecer na agenda quando o pedido terminar, para criar sem digitar.
77. Como usuário, quero que o chat com o Hermes só apareça onde ele está ligado, para não ver uma opção que não
    funciona.
78. Como dono, quero abrir uma skill ou um agente do Hermes e ler o texto atual do arquivo, para saber o que está em
    vigor.
79. Como dono, quero ver os backups de um arquivo e restaurar um deles, para desfazer uma mudança ruim.
80. Como dono, quero pedir ao Hermes uma edição num arquivo e acompanhar o pedido, para mudar o comportamento do
    agente pela aplicação.
81. Como usuário que não é o dono, quero não ver as ações de arquivo do agente, para não esbarrar em um "acesso
    negado".

### Modos de visualização

82. Como usuário, quero escolher entre ver só os meus eventos, só os dos agentes ou todos, na agenda e na lista de
    tarefas, para focar no que me interessa.
83. Como usuário, quero abrir o menu de modos tocando na aba que já está selecionada, com o menu subindo da barra
    inferior, para trocar de modo sem sair da tela.
84. Como usuário, quero que cada modo do menu mostre quem está nele (pessoa, robô ou os dois) e um nome, para
    escolher sem dúvida.
85. Como usuário, quero que a aba selecionada tenha a cor do modo em uso, uma cor própria para cada um dos três,
    para sempre saber em que modo estou.
86. Como usuário, quero que o modo escolhido continue valendo quando eu voltar à tela, para não escolher de novo.
87. Como usuário, quero fechar o menu tocando fora dele, para desistir da troca.

### Acesso

88. Como usuário com sessão válida, quero que as chamadas de artefatos e de pedidos passem pelo gateway, para o web
    funcionar.
89. Como administrador, quero que artefatos e pedidos sigam as mesmas regras de papel que notas e IA seguiam, para
    ninguém ganhar nem perder acesso com a troca.

## Decisões de implementação

### Ordem e fronteiras

- O porte segue a ordem do TDD: API (feita), gateway, web. O Android vem depois, em spec própria.
- Nada muda na API por causa desta spec. Onde o canvas pede um dado que o contrato não tem, a tela não o mostra; a
  lista dessas lacunas está em "Notas".
- O banco recomeça do zero, então não há dado antigo para converter nem compatibilidade a manter no web.

### Gateway do Auth

- A política de rotas passa a reconhecer `/api/artifacts` e `/api/requests`, e deixa de reconhecer `/api/tasks` e
  `/api/notes`.
- O conjunto de recursos de acesso troca `task` e `note` por `artifact`. `/api/requests` usa o recurso `agent`, como
  `/api/ai`: `POST` é `execute` e `GET` é `read`. Assim a conferência do `userId` do corpo, que já vale para o
  recurso `agent`, cobre os pedidos.
- Quem lia e escrevia notas passa a ler e escrever artefatos; a regra por papel (leitor, membro, administrador) não
  muda.

### Contratos no web

- O web passa a depender do pacote de contratos compartilhado e para de manter uma cópia própria do formato de
  fio. Ficam no web só os tipos que são da tela.
- Os contratos antigos de tarefa, nota, processo de IA, job de IA e automação saem do web, junto com os módulos que
  só existiam para eles.

### Cliente da API (módulo novo, um só)

- As telas deixam de montar caminho e corpo de requisição. Um módulo único expõe uma função por rota da API, com
  entrada e saída nos tipos do pacote de contratos, e é o único lugar que conhece caminhos, parâmetros de consulta e
  cabeçalhos.
- Esse módulo cuida de quatro coisas que hoje estão espalhadas: enviar `expectedRevision` em toda edição; enviar
  `Idempotency-Key` em toda criação de evento, artefato e série, estável enquanto o formulário estiver aberto;
  seguir o `nextCursor` da agenda até a janela acabar; e traduzir a resposta em erros que a tela distingue (não
  encontrado, revisão desatualizada, entrada inválida, sem permissão, serviço desligado).
- A renovação de sessão no 401 continua onde está, por baixo desse módulo.

### Rotas que o web passa a usar

| O que a tela faz | Rota |
|---|---|
| Agenda de uma janela | `GET /api/events` com `from`, `to`, `actor`, `tag`, `cursor` |
| Lista de tarefas | `GET /api/events/tracked` com `actor`, `status`, `priority`, `tag`, `q`, `longRunning` |
| Criar, ler, editar e apagar evento | `POST /api/events`, `GET`, `PATCH` e `DELETE /api/events/{eventId}` |
| Sugestão de tags | `GET /api/tags` |
| Lista de artefatos, catálogo global e artefatos de um evento | `GET /api/artifacts` com `type`, `scope`, `tag`, `q`, `eventId` |
| Criar, ler, editar e apagar artefato | `POST /api/artifacts`, `GET`, `PATCH` e `DELETE /api/artifacts/{artifactId}` |
| Séries | `GET` e `POST /api/recurrences`, `GET`, `PATCH` e `DELETE /api/recurrences/{recurrenceId}` |
| Pedido pelo chat | `POST /api/requests` e `POST /api/requests/hermes` |
| Edição da entidade aberta | `POST /api/requests/edit` |
| Evento por voz | `POST /api/requests/voice` |
| Acompanhar, listar e cancelar pedidos | `GET /api/requests/{requestId}`, `GET /api/requests`, `POST /api/requests/{requestId}/cancel` |
| Arquivos do agente (só o dono) | `GET /api/ai/config`, `/file`, `/backups`, `POST /api/ai/config/restore` e `/edit-request` |

De onde cada chamada antiga vai:

| Antes | Agora |
|---|---|
| `/api/tasks` e `/api/tasks/{id}` | `/api/events/tracked` e `/api/events/{id}` |
| `/api/notes` e `/api/notes/{id}` | `/api/artifacts` e `/api/artifacts/{id}` |
| `/api/ai/process` e `/api/ai/process/{id}` | `/api/requests` e `/api/requests/{id}` |
| `/api/ai/process/edit` | `/api/requests/edit` |
| `/api/ai/automation` e `/api/ai/jobs/{id}` | `/api/requests/hermes` e `/api/requests/{id}` |
| `/api/events/voice` e `/api/events/voice/jobs` | `/api/requests/voice` e `/api/requests/{id}` |

### A linha das listas

- Um componente só desenha a linha, na agenda e na lista de tarefas. Ele lê o cartão de evento do contrato, sem
  campo extra, como o TDD descreve em "O que o cartão das listas lê".
- O executor decide a apresentação: pessoa fica solta no fundo, agente fica num cartão verde-água. O glifo de status
  é o mesmo contorno nos dois lados e nunca fica dentro de moldura.
- O tipo aparece sempre como ícone mais o código em fonte mono, para pessoa e para agente.
- Os textos calculados ficam em funções puras que recebem o cartão e o instante atual: "Era ontem" e atrasado (a
  fazer com o dia passado, ou evento longo com o prazo vencido), o horário de um a fazer com hora (o antigo
  "agendado", que deixou de ser status), "Prazo …" do evento longo, a regra da série, o tempo decorrido de um
  pedido, e o dia sem horário (início à meia-noite local).
- A prioridade tem quatro níveis: urgente, alta, média e baixa. Os níveis antigos do web saem.

### Lista de tarefas

- Os grupos seguem o canvas e juntam os dois executores:

  | Grupo | Status de pessoa | Status de agente |
  |---|---|---|
  | Em curso | `doing` | `running` |
  | A fazer | `todo` | `queued` |
  | Sem data | `toDefine` | — |
  | Em espera | `inHold` | `waiting` |
  | Feitas (recolhido) | `done` | `done` |
  | Encerradas (recolhido) | `cancel`, `missed` | `cancel`, `failed` |

- Uma série aparece uma vez: se vier mais de uma ocorrência em aberto da mesma série, a tela fica com a mais próxima
  e mostra a regra no lugar do horário.
- O toque no glifo de um evento de pessoa conclui ou reabre, como hoje. Reabrir leva a `todo`. O glifo de um evento
  de agente não muda status.
- Enquanto houver na lista um evento de agente na fila, executando ou aguardando, a lista se recarrega em intervalo,
  como o acompanhamento de job faz hoje.

### Agenda

- A janela é carregada por páginas até o fim. O filtro por executor vem do modo em uso.
- O tempo livre continua calculado na tela e conta só os eventos de pessoa. O toque na janela livre continua abrindo
  o chat do agente com a janela preenchida, como hoje.
- O título com o dia sai do cabeçalho; a tira da semana fica.
- No evento de referência, o toque no glifo abre a escolha de status, e escolher um passa a acompanhá-lo.
- Os avisos continuam calculados no cliente, agora a partir da janela da agenda e da lista de tarefas, sem contar
  duas vezes o evento que está nas duas.

### Detalhe e formulário do evento

- As rotas de tela de tarefa e de evento viram uma só rota de detalhe de evento. Os endereços antigos de tarefa
  redirecionam para ela.
- Para o evento de pessoa há dois modos. Leitura: os campos em texto, com status, prioridade e o status de cada
  subtarefa ainda trocáveis, lápis e "Mais ações" no cabeçalho, e o campo do agente no rodapé. Edição: cada campo é
  uma entrada, o cabeçalho diz "Editar evento" e o rodapé tem só Descartar e Salvar.
- O cabeçalho do detalhe mostra "Evento" no centro, e não o nome da lista de origem.
- A criação usa o formulário da edição. A escolha entre Tarefa e Evento some do painel de criação: é um evento, com
  ou sem status. Nota continua como opção e cria um artefato de texto.
- Salvar envia só os campos que mudaram, com a revisão lida. Diante de revisão desatualizada, a tela avisa, recarrega
  o evento e mantém o que o usuário digitou para ele conferir.
- A sequência (`previousEventIds` e `nextEventIds`) e os artefatos são editados como listas dentro do formulário e vão
  na mesma edição do evento. A sequência não revisa os outros eventos. A ordem dos artefatos é a ordem da lista.
- O alimento ligado a uma refeição entra como cópia do original, com a quantidade. O exercício ligado a um treino é
  o artefato global, por referência.
- A recorrência é criada, alterada e apagada pelas rotas de série. A série nasce no formulário de criação: com a
  regra definida, Salvar cria a série em vez de um evento avulso. Numa ocorrência, o formulário mostra a regra, desde
  quando vale, se tem fim e se a ocorrência segue a série. Um evento avulso que já existe não vira série.
- "Tarefa persistente" liga e desliga o evento longo. Ligada, o fim planejado passa a ser o prazo, a recorrência
  some do formulário e o evento precisa ter status.
- O Registro não aparece no evento de pessoa: o contrato do evento não traz as datas de criação e de alteração. Ele
  aparece no evento de agente, pelo pedido, e no artefato, só com criação e última alteração.

### Detalhe do evento de agente

- O evento de agente abre na mesma rota de detalhe, com outra forma. Os dados vêm da leitura do evento e, por cima,
  do pedido com o mesmo id.
- Seções: Informações (início, conclusão), Entradas (as entradas do trace do pedido, em ordem), Passos, Produziu (as
  entidades do pedido, cada uma abrindo o seu detalhe), Sessão ("Continua de", pelo `sessionId`) e Registro.
- Não há modo de edição: as entradas só se acrescentam e os campos de execução são do sistema. Mudanças passam pelo
  campo do agente no rodapé, que abre um pedido na mesma sessão.
- "Cancelar pedido" fica na linha de status do campo do agente e só aparece com o pedido em aberto. Se a API
  responder que o pedido calcula um alimento, a tela diz que é preciso apagar o artefato.
- O detalhe de um pedido em aberto se recarrega em intervalo até o estado final.

### Artefatos

- A aba continua se chamando Notas e lista artefatos. As cópias derivadas não aparecem na lista.
- O detalhe mostra os eventos em que o artefato aparece, com a relação de cada um, no lugar dos antigos vínculos de
  nota.
- O alimento é criado com o texto do que foi comido; o estado do cálculo vem no próprio artefato, e a tela se
  recarrega enquanto ele estiver pendente.
- Um artefato global mostra "catálogo global" e não tem ações de editar nem de apagar.
- Skill e agente continuam como artefatos que apontam para um arquivo. O texto, os backups e a restauração vêm das
  rotas de arquivo do agente. Para quem não é o dono, a API responde sem permissão e a tela esconde essas ações.

### Pedidos: chat, barra de edição e voz

- A tela do chat não muda (TDD, fora de escopo). Muda o que há por baixo: enviar abre um pedido, e a caixa de
  passos, as entidades tocadas e a resposta vêm do acompanhamento do pedido.
- A sessão é o primeiro pedido: as mensagens seguintes mandam o id dele como `sessionId`.
- Toda mensagem leva um id de cliente estável, e reenviar a mesma não abre um segundo pedido.
- Ao recarregar a página, o chat recupera os pedidos em aberto pela lista de pedidos.
- O chat descobre se o Hermes está ligado pela resposta de "não encontrado" da rota dele, como hoje.
- A barra de edição com IA do detalhe abre um pedido de edição, com o tipo de entidade do conjunto que a API aceita
  (evento, artefato e as variantes de alimento, sono, treino, skill e agente).
- O botão de voz abre um pedido de voz; o evento criado é lido das entidades do pedido quando ele termina.

### Modos de visualização

- Três modos fixos, cada um um filtro por executor: os seus eventos (pessoa), os eventos dos agentes (agente) e
  todos (sem filtro). Valem para a agenda e para a lista de tarefas.
- O menu sobe da barra inferior, com animação, até o meio da tela, quando o usuário toca na aba já selecionada. Tocar
  fora fecha. Cada linha tem os símbolos de quem está no modo e o nome.
- A aba selecionada usa a cor do modo: uma para pessoa, verde-água para agentes e uma terceira, própria, para todos.
  A terceira não é mistura das outras duas.
- O modo escolhido fica guardado no navegador e vale para as duas listas.
- Os botões "Agentes" liga e desliga das duas listas não existem.

### Paridade com o Android

- Cada tela portada atualiza a sua linha em `docs/mobile-parity.md`, com o Android marcado como em progresso e o
  motivo (porte na ordem API, web, Android). A exceção em aberto no topo desse documento continua até o Android ser
  portado.

### Fatias sugeridas

Cada fatia entrega uma tela funcionando contra a API nova, de ponta a ponta:

1. Gateway, dependência de contratos, cliente da API e a API falsa dos testes.
2. Agenda em leitura, com a linha nova.
3. Lista de tarefas em leitura, com grupos e troca de status.
4. Detalhe em leitura, edição, criação e exclusão de evento, com série.
5. Artefatos: lista, detalhe, criação e edição, com alimento e catálogo global.
6. Pedidos: chat, barra de edição com IA e voz.
7. Detalhe do evento de agente.
8. Modos de visualização.
9. Arquivos do agente: texto, backups e restauração.
10. Remoção do que sobrou do contrato antigo e revisão do documento de paridade.

## Decisões de teste

- Um bom teste aqui exercita o que o usuário vê e faz na tela (o que aparece, em que grupo, com que texto, o que
  acontece ao tocar) e o que sai pela rede (rota, parâmetros e corpo). Não confere estado interno, nomes de
  componente nem a ordem das chamadas que não muda o resultado.
- **Costura 1: a tela, pela fronteira HTTP.** Cada tela é montada com o cliente HTTP autenticado trocado por uma API
  falsa em memória. É a mesma costura que os testes de tela de hoje usam; o que muda é que a API falsa passa a ser
  uma só, compartilhada, em vez de respostas soltas por teste.
- A API falsa guarda eventos, artefatos, séries e pedidos, responde às rotas da tabela acima e confere todo corpo
  recebido e toda resposta devolvida contra os esquemas do pacote de contratos. Um teste que envia ou espera um
  formato que a API real não aceita falha por isso, e não em produção.
- A API falsa reproduz os comportamentos que as telas tratam: revisão desatualizada, não encontrado, reenvio com a
  mesma chave de idempotência, pedido que avança de estado entre duas leituras, página seguinte da agenda, Hermes
  desligado e acesso negado nos arquivos do agente.
- Telas cobertas: agenda, lista de tarefas, detalhe em leitura, formulário de edição e criação, detalhe do evento de
  agente, lista e detalhe de artefatos, painel do chat, barra de edição com IA, botão de voz e menu de modos.
- Os textos calculados da linha (atrasado, "Era ontem", prazo, regra da série, tempo decorrido, dia sem horário) são
  conferidos pelos testes de tela com o relógio fixo, como os testes da lista de tarefas e do detalhe de evento já
  fazem.
- **Costura 2: a política de rotas do gateway.** A função que decide recurso e ação a partir de método e caminho já
  tem teste próprio. Ele ganha os casos de artefatos e de pedidos, e os de tarefas e notas passam a esperar recusa.
- Um teste de cobertura no web confere que cada rota documentada da API tem uma função no cliente da API, para que
  uma rota nova não fique sem consumidor em silêncio. É o mesmo desenho do teste que confere o catálogo do Swagger
  contra os controllers.
- Arte anterior: os testes de tela da lista de tarefas, do detalhe de evento e do painel do chat no web; o teste da
  política do gateway no Auth; o teste do catálogo OpenAPI na API; os testes de contrato do mobile, que usam os
  mesmos esquemas.
- Os testes de contrato do mobile e a geração de fixtures continuam quebrados até o porte do Android. Esta spec não
  os conserta com uma cópia congelada do contrato antigo.

## Fora de escopo

- O app Android. Ele é portado depois do web, em spec própria, e até lá não funciona contra esta API.
- Qualquer mudança na API, no banco ou nos contratos compartilhados.
- O redesenho da tela do chat.
- Os modos configuráveis pelo usuário ("Novo modo", "Apenas refeição e exercícios"): não há onde guardá-los na API.
- A troca do símbolo do agente na barra inferior (o robô do canvas). Ela conflita com a
  [ADR 0009](../adr/0009-simbolo-candeia-de-bico-e-sinal-do-agente.md), que define a lamparina e a chama como sinal
  do agente, e precisa de decisão própria.
- A troca de "Hermes" por "Candeia" nos textos visíveis (ADR 0007). Os rótulos ficam como estão hoje no web.
- Os campos do canvas que o contrato do evento não tem: localização e fuso horário por evento.
- A lista de sessões e o histórico do chat, que o TDD deixa como questão em aberto.
- Modos de visualização para artefatos: o artefato não tem executor.
- Migração de dados: o banco recomeça do zero.

## Notas

O que o canvas desenha e a API ainda não entrega. Em cada caso a tela não mostra o item; se ele for desejado, a
mudança começa pela API:

| No canvas | Situação no contrato |
|---|---|
| "Localização" no detalhe | O evento não tem campo de local. |
| "Horário padrão" (fuso) no detalhe | Só a série tem fuso; o evento não. |
| "Término" e "Previsão de entrega" como duas linhas | Há um só fim planejado. A tela mostra uma linha: "Término" no evento comum, "Previsão de entrega" no evento longo. |
| "2 de 4 passos" na linha da lista | O cartão de evento não traz passos; a contagem aparece só no detalhe. |
| "Fim estimado" e "Job · tentativa 1 de 3" no detalhe do agente | O pedido traz só um texto de progresso. |
| "Continuações" na seção Sessão | O pedido traz o `sessionId`, mas não há consulta das continuações. |
| "Registro" no detalhe do evento de pessoa | O evento não traz as datas de criação e de alteração; o pedido e o artefato trazem. |
| "Gerado por" no detalhe do evento de pessoa | O evento não traz a relação `generates` de volta; a origem só é conhecida a partir do pedido. |
| Ler o texto de um backup antes de restaurar | A lista de backups traz só data e tamanho; não há rota que devolva o texto de um backup. |
| Criar uma série a partir de um evento que já existe | A rota de séries cria a regra e o modelo; não liga um evento existente a ela. A série nasce no formulário de criação. |
| "Aguardando você" | O status `waiting` existe no contrato, mas nenhum fluxo da API o produz hoje. A tela o trata; a resposta do usuário segue como continuação da sessão. |

Escolhas desta spec que o canvas não desenha e que merecem revisão antes de virar código:

- O grupo "Encerradas" da lista de tarefas, que junta cancelado, não realizado e falhou.
- A criação de evento pelo mesmo formulário da edição, sem a escolha entre Tarefa e Evento.
- O toque no glifo da lista concluir e reabrir, em vez de abrir a escolha de status.
- A tela de backups e restauração de arquivo do agente, que não tem quadro no canvas e segue o desenho atual do
  detalhe da nota de arquivo.
- A cor do modo "todos": o canvas propõe âmbar e deixa azul, lavanda e coral como alternativas.

Pontos de atenção para quem implementa:

- Na API, `finishedAt` é a conclusão real e `estimatedFinishAt` é o fim planejado. O web de hoje usa `finishedAt`
  como fim planejado em vários lugares; o cálculo de posição do evento já foi corrigido, os demais mudam com o porte.
- A API não grava a conclusão sozinha: ao levar um evento de pessoa a `done`, o web envia `finishedAt` com o instante
  atual, e ao tirá-lo de `done` envia `finishedAt` nulo.
- O botão de voz não está montado em nenhuma tela hoje; o porte cobre o componente e a fila, sem montá-lo.
- O status "agendado" não existe mais: um a fazer com horário é mostrado com o horário.
- Um dia sem horário é o início à meia-noite local, e não se distingue de um evento que começa de fato à meia-noite.
- O detalhe de um pedido responde pelo mesmo id do evento de agente.
