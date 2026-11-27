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
   agente de escrita. A primeira regra que se aplica vale. Nesta versão são duas: a ocorrência fica no projeto da série e
   todo o resto fica em `personal`. As demais regras (o `projectId` da entrada, o projeto do pedido para os passos, o da
   sessão, o da tarefa editada) entram com a escolha do projeto.
5. **O cartão da tarefa e o pedido trazem sempre o projeto**, como `{ id, name, personal }`. O esquema dos contratos
   recusa o cartão e o pedido sem ele. `GET /api/projects` devolve os projetos do usuário, `personal` primeiro e os
   outros por nome, e cria o `personal` de quem ainda não tem nenhum.
6. **A marca do projeto é uma regra pura**, em `packages/theme` ao lado da regra que dá a cor das tags
   (`projectInitials`, `projectMarkColors`), compartilhada com o Android por fixture. As iniciais são as das duas
   primeiras palavras (separadas por espaço, `_`, `-`, `.`, `/` e pela passagem de minúscula para maiúscula) ou os dois
   primeiros caracteres de uma palavra só. O matiz vem do nome pela função que dá o matiz das tags, com a luminosidade e
   o croma das tags de cada tema, e o texto usa a cor do fundo da tela. `personal` não tem cor: fundo suave, texto
   apagado e um fio de contorno.
7. **Na tela, o projeto é a linha da tarefa** (marca e nome), abaixo do título e acima da linha do tipo, igual para
   pessoa e agente, também quando é o `personal`. Os detalhes da tarefa e do pedido o mostram, só para leitura.

## Alternativas rejeitadas

- Escolher a cor do projeto: a cor vem do nome até o dono do produto dizer outra coisa.
- Uma coluna `project` em texto livre na tarefa: sem tabela, não haveria como garantir o nome único nem o `personal`.
- Criar o `personal` de todos os usuários na migration: quem nunca teve tarefa ganha o seu na primeira necessidade.

## Consequências

- O projeto de uma tarefa só muda quando as telas e a API passarem a aceitar `projectId`; até lá, quase toda tarefa
  está em `personal`.
- O Android lê o cartão com o campo novo e o ignora; a linha do projeto fica registrada como pendente em
  `docs/mobile-parity.md`.
- O agente de consulta ainda não enxerga o projeto: a visão de tarefas dele não ganhou o nome do projeto.
