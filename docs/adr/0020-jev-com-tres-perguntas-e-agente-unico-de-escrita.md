---
status: accepted
date: 2026-11-22
---

# O JEV responde três perguntas e a escrita do chat é de um agente só

Substitui, na ADR 003 (`.agents/docs/ai-dialog/adr-003-rota-por-processo.md`), o JEV de entrada com uma pergunta por
operação × entidade, o JEV de candidatos, o JEV de vínculo da finalização e os agentes de criação e de edição por tipo.
Muda o item 1 da [ADR 0018](./0018-hermes-como-fallback-do-pedido-por-passos.md): o Hermes deixa de ser só o fallback e
passa a ser o destino de toda tarefa de agente. Usa o modo modelo da [ADR 0019](./0019-modo-modelo-no-chat.md) como
destino dos pedidos de configuração.

## Contexto

O JEV de entrada fazia sete perguntas por pedido (criar e editar tarefa, artefato e série, mais a consulta), e cada
resposta precisava de 0,92 de certeza: uma só pergunta incerta mandava o pedido ao Hermes. Na prática quase tudo ia ao
Hermes. Dos 28 pedidos gravados na base de desenvolvimento, 27 caíram no fallback, 21 deles com `artifact_create`
incerta (confiança de 0,26 a 0,91), muitas vezes com `task_create` em 1,00.

O dono do produto pediu três destinos: toda consulta de dados a um agente de consulta ao banco, toda criação e
atualização a um agente de criação e atualização de entidades, e toda tarefa de agente ao Hermes. Depois pediu que o
JEV respondesse apenas três perguntas: se o usuário quer só consultar o banco, se quer só criar ou atualizar uma
entidade, e se quer configurar o app ou tratar do modelo e do provedor, que é assunto interno e não tarefa do Hermes.

## Decisão

1. **Três perguntas de sim ou não, numa chamada, e só elas** (`jev/dispatch.json`): `query`, `write` e `config`. Um
   único `yes` certo escolhe o destino. Três `no` são uma tarefa de agente: o pedido passa para a rota do Hermes, sem
   motivo de fallback. Um `yes` incerto, mais de um `yes`, o JEV fora do ar e o prefixo `fallback:` também vão ao
   Hermes, como fallback.
2. **Certeza mínima de 0,7.** Numa pergunta de sim ou não a confiança do JEV é `2p - 1`, então 0,7 pede probabilidade
   acima de 0,85. Medido no JEV com 115 frases, em duas execuções: nenhum destino errado foi aceito, e o `yes` errado
   mais forte ficou em 0,71 de probabilidade.
3. **`query` vai ao agente de consulta**, que não mudou.
4. **`write` vai a um agente só, o de escrita** (`agents/entity.md`, passo `entity`). Uma chamada devolve tudo o que o
   pedido cria (tarefas, artefatos de texto e séries), tudo o que ele altera no que já existe e a que tarefa cada
   artefato novo pertence. O servidor valida, prepara tudo numa sessão de mudanças e grava num lote só, junto com o
   registro do passo.
5. **O agente de escrita recebe a lista curta inteira.** O servidor lista as tarefas de ontem, hoje e amanhã, as
   acompanhadas em aberto e os artefatos e as séries mais recentes, e entrega tudo ao agente, que escolhe o que o
   pedido altera. Ele só pode alterar um `id` que veio dessa lista ou de UMA consulta de leitura que ele mesmo pede
   quando o alvo não está nela.
6. **Quem liga é o agente.** O alimento nasce ligado à refeição e a anotação nasce ligada à tarefa de que trata, no
   mesmo lote. A finalização só marca o que o passo gravou e fecha o pedido.
7. **`config` vai ao modo modelo** (ADR 0019): o pedido muda para a rota `model`, com a escolha padrão do ambiente
   (`RequestStore.handToModel`). Sem nenhuma chave de provedor, ou com as ferramentas da agenda ligadas e um usuário
   que não é o dono delas, o pedido vai ao Hermes.
8. **Os relatos-guia que o dono definiu valem como regra do agente de escrita.** "Vou caminhar agora" cria uma tarefa
   de treino sem status, que começa agora e dura o padrão do tipo. "Quero estudar hoje" cria uma tarefa a fazer, sem
   início (fora da agenda), com o dia de hoje como prazo. "Comi 200g de macarrão" cria a refeição com o alimento
   ligado, de onde saem as calorias e a receita.
9. **Saem** os agentes `task-create`, `artifact-create`, `recurring-task-create` e `recurring-task-edit`, o worker de
   criação, `jev/candidates.json` e `jev/link.json`. `task-edit` e `artifact-edit` ficam só para a edição pela tela de
   detalhe ([ADR 0006](./0006-edicao-por-alvo-pela-rota-por-processo.md)), que não mudou.

## Alternativas rejeitadas

- **Manter uma pergunta por operação e só afrouxar a incerteza.** O JEV continuaria decidindo o que criar e errava com
  certeza alta em casos comuns: "mude o jantar para as 21h" dava `artifact_edit` com 0,96.
- **Uma pergunta de destino com três critérios, mais as seis de operação valendo por probabilidade.** Foi implementada
  e medida no mesmo dia (71 de 71 frases claras no destino certo), mas mantinha o JEV escolhendo agentes. O dono pediu
  o JEV só com as três perguntas.
- **Um planejador que escolhe quais dos agentes por tipo rodam.** Seria uma chamada a mais por pedido, e a ligação
  entre o que cada agente cria continuaria dependendo de outro modelo adivinhar depois.
- **Manter o JEV de candidatos e o de vínculo.** O agente que escreve já sabe a que o pedido se refere e o que pertence
  a quê; perguntar de novo a outro modelo só acrescentava chamadas e pontos de falha.
- **Um agente interno novo, ou um texto fixo, para os pedidos de configuração.** O dono escolheu o modo modelo, que já
  existe e já responde qual modelo e qual provedor o atendem.
- **Mandar a escrita ao Hermes.** Mais lento e sem resposta estruturada: o lote atômico e a caixa de processo se
  perderiam no caso mais comum.

## Consequências

- A escrita é tudo ou nada: se uma parte do pedido é recusada, nada é gravado. Antes, passos separados podiam gravar
  pela metade.
- Um pedido de escrita custa uma chamada ao modelo (duas quando ele pede a consulta), com um prompt maior e até 70
  candidatos junto. Medido com o modelo de passos: cerca de 1 s por pedido.
- Um pedido que mistura consulta e registro ("almocei; o que tenho hoje?") vai ao Hermes. Antes virava dois passos.
- Frases soltas ("reunião", "estudar") não chegam à certeza mínima e vão ao Hermes: 6 das 50 frases de escrita da
  medição.
- Se o JEV manda à escrita um pedido que não cria nem altera nada, o passo falha com `empty` e o pedido termina com a
  linha de falha. Ele não é reencaminhado ao Hermes.
- O pedido de configuração é respondido pelo modelo padrão do servidor, não pela escolha guardada no aparelho, e não
  troca o seletor: "troca para o Claude" no chat recebe uma resposta, mas o modo e o modelo escolhidos continuam os
  mesmos.
- A tarefa de "quero estudar hoje" aparece como "Sem data" na lista de tarefas, que só mostra prazo em tarefa
  persistente. O prazo está gravado e aparece no detalhe.
- Sem o Hermes (`AI_AUTOMATION=off`), o que não é consulta, escrita nem configuração falha com o aviso da ADR 0018.
- Passos dos agentes removidos que estiverem na fila no deploy não têm mais quem os execute e falham. Os pedidos
  antigos continuam legíveis: o rótulo de cada passo fica em `ui.json`.
- Os artefatos `router` "JEV · Vínculo" e "JEV · Candidatas de edição" do dono deixam de ser atualizados e continuam
  na lista até serem apagados à mão.
- O web já troca a caixa de processo pela conversa do agente quando o pedido muda para a rota `hermes` ou `model`. O
  Android lê as mesmas rotas, mas a troca no meio de um pedido não foi conferida nele.
