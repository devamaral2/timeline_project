---
status: accepted
date: 2026-11-26
---

# Projeto em toda tarefa

Spec 51. Esta ADR registra só a decisão dos projetos; o status de agente, a situação, as quatro gavetas e a gaveta de execução da mesma spec têm as suas decisões ao lado.

## Contexto

Com agentes trabalhando em vários projetos ao mesmo tempo e as tarefas pessoais no meio, a lista mistura tudo: não há
como dizer a que frente de trabalho uma tarefa pertence. O glossário usava "projeto" como imagem da tarefa longa, o que
atrapalha dar o nome a quem de fato agrupa tarefas.

## Decisão

1. **Toda tarefa, de pessoa ou de agente, pertence a um projeto.** `tasks.project_id` e `recurrences.project_id` são
   obrigatórios, com chave estrangeira sem `cascade`: um projeto com tarefas não se apaga. A tabela `projects` guarda
   `user_id`, `name`, `personal`, e as datas.
2. **O nome tem de 1 a 60 caracteres sem os espaços das pontas e é único por usuário sem distinguir maiúsculas**
   (índice único sobre `lower(name)`). Cada usuário tem no máximo um `personal` (índice único parcial), e o nome dele é
   sempre `personal`.
3. **`personal` é o padrão.** A migration cria um para cada usuário que já tem tarefa ou série e preenche as duas colunas
   antes de torná-las obrigatórias. Para os demais, ele nasce na primeira necessidade, sob a trava por usuário que já
   existe (`lockUser`), e uma vez só mesmo com duas gravações ao mesmo tempo.
4. **A resolução do projeto mora num módulo só** (`resolveProjectId`, em
   `apps/api/src/infrastructure/persistence/projects/resolve-project.ts`), e as duas funções que inserem tarefa
   (`insertTaskAggregate` e `insertAgentTask`) e a que insere série (`insertRecurrenceAggregate`) passam por ele: criação
   pela pessoa, nascimento de pedido, passos, cálculo de alimento, tarefa criada por voz, ocorrência de série e lote do
   agente de escrita. A primeira regra que se aplica vale, nesta ordem: o `projectId` da entrada (que precisa ser do
   usuário, senão `ProjectNotFoundError`, 404; `null` pede o `personal` de propósito); o projeto do pedido, para o passo
   e para a tarefa ou série que o pedido cria pela rota por passos (o lote do agente de escrita leva o `requestId`); o
   projeto do primeiro pedido
   da sessão; o projeto da tarefa sobre a qual o pedido de edição foi feito; o projeto da série, para a ocorrência; e
   `personal` para o resto. Uma regra que não acha o que procura (o pedido sumiu, a tarefa alvo foi apagada) passa
   adiante. O pedido de voz e o cálculo de alimento não trazem regra e ficam em `personal`. O projeto de uma tarefa de
   agente não muda depois que ela nasce.
5. **O cartão da tarefa e o pedido trazem sempre o projeto**, como `{ id, name, personal }`. O esquema dos contratos
   recusa o cartão e o pedido sem ele. `GET /api/projects` devolve os projetos do usuário, `personal` primeiro e os
   outros por nome, e cria o `personal` de quem ainda não tem nenhum.
6. **A marca do projeto é uma regra pura**, em `packages/theme` ao lado da regra que dá a cor das tags
   (`projectInitials`; a cor sai de `hueForTag` e dos tokens de tag, sem função própria), compartilhada com o Android por fixture. As iniciais são as das duas
   primeiras palavras (separadas por espaço, `_`, `-`, `.`, `/` e pela passagem de minúscula para maiúscula) ou os dois
   primeiros caracteres de uma palavra só. O matiz vem do nome pela função que dá o matiz das tags, com a luminosidade e
   o croma das tags de cada tema, e o texto usa a cor do fundo da tela. `personal` não tem cor: fundo suave, texto
   apagado e um fio de contorno.
7. **Na tela, o projeto é a linha da tarefa** (marca e nome), abaixo do título e acima da linha do tipo, igual para
   pessoa e agente, também quando é o `personal`. Os detalhes da tarefa e do pedido o mostram, só para leitura.
8. **A pessoa escolhe e cria o projeto no formulário da tarefa.** `POST /api/projects`, com `{ name }`, cria um projeto
   (409 para nome repetido, sem distinguir maiúsculas nem espaços das pontas, e o `personal` conta mesmo antes de
   existir; 400 para nome vazio ou com mais de 60 caracteres). A criação e a edição de tarefa de pessoa aceitam
   `projectId`: na edição ausente não muda e `null` devolve a tarefa a `personal`, e trocar o projeto é uma edição comum,
   com `expectedRevision`, que destaca a ocorrência da série como qualquer outro campo. O projeto de uma série é um campo
   do modelo dela (`template.projectId`): o `projectId` do modelo vale antes das regras do pedido, e um modelo sem ele não
   muda o projeto da série (para voltar a `personal`, o modelo leva o id dele). A coluna `recurrences.project_id` guarda
   a resolução e as ocorrências novas nascem nela; as que já existem ficam onde estavam. A série recebe o projeto
   quando é criada, o da tarefa que a cria (o `personal` leva o id dele); depois disso nenhuma tela o troca, como
   também não troca o nome nem as etiquetas dela. Editar o projeto de uma ocorrência muda só a ocorrência, que se
   destaca da série, e o editor de regra da série não manda projeto. No formulário o campo
   "Projeto" mostra a marca e o nome, abre a escolha (`personal` primeiro, os outros por nome, busca pelo nome) e cria um
   projeto com o texto digitado, sem fechar a escolha quando o nome já existe.

## Alternativas rejeitadas

- Escolher a cor do projeto: a cor vem do nome até o dono do produto dizer outra coisa.
- Uma coluna `project` em texto livre na tarefa: sem tabela, não haveria como garantir o nome único nem o `personal`.
- Criar o `personal` de todos os usuários na migration: quem nunca teve tarefa ganha o seu na primeira necessidade.

## Consequências

- O projeto de uma tarefa de pessoa muda pelo formulário. O de uma tarefa de agente só passa a sair do `personal` quando o
  chat tiver onde escolher o projeto do pedido.
- O Android lê o cartão com o campo novo e o ignora; a linha do projeto fica registrada como pendente em
  `docs/mobile-parity.md`.
- O agente de consulta enxerga o projeto: a visão `tasks` dele tem a coluna `project` com o nome, só para tarefas de
  pessoa, como antes.
- As rotas que abrem pedido (chat, Hermes e modo modelo) aceitam `projectId` opcional; o chat ainda não o envia, porque
  escolher o projeto no chat está fora do escopo da spec 51.
