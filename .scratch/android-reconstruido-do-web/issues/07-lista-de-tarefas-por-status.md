# 07: Lista de Tarefas por status

**What to build:** Na aba Tarefas, o usuário vê as tarefas acompanhadas agrupadas em Em curso, A fazer, Sem data, Em espera, Feitas e Encerradas, muda o status de uma tarefa de pessoa pelo glifo da linha e filtra por tag, prioridade e texto. A lista vazia oferece "Nova tarefa".

**Blocked by:** 04, 05

**Status:** done

**Leia antes:** o [README](README.md). No web: a tela de tarefas, os grupos e filtros de tarefas e o texto dos cartões.

- [x] A lista lê `GET /api/tasks/tracked` com executor, status, prioridade, tag e texto.
- [x] Os grupos seguem a regra do web, com Feitas e Encerradas começando recolhidas; a regra de grupos e o texto das linhas são portados e conferidos contra fixtures do TS.
- [x] Uma série recorrente aparece como uma linha só.
- [x] O glifo de uma tarefa de pessoa abre o seletor de status do ticket 04; o de agente só mostra o status.
- [x] O menu da seção tem uma lista por tag e a engrenagem com as prioridades.
- [x] Lista vazia mostra o estado do web com "Nova tarefa" (que leva à criação quando o ticket 13 existir).
