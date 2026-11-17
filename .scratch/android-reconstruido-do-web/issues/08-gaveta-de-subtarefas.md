# 08: Gaveta de subtarefas

**What to build:** Na lista de Tarefas, a subtarefa cuja principal está na lista fica na gaveta da principal. A principal mostra a fração e a pizza das subtarefas diretas feitas, e tocar nela abre e fecha a gaveta. Dentro da gaveta, o usuário muda o status de uma subtarefa de pessoa e abre gavetas aninhadas.

**Blocked by:** 07

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). ADRs [0016](../../../docs/adr/0016-subtarefa-no-lugar-da-sequencia.md) e [0017](../../../docs/adr/0017-subtarefas-dentro-da-principal-na-lista.md). No web: o aninhamento de subtarefas nos grupos de tarefas.

- [ ] O aninhamento é portado da regra do web e conferido contra fixtures do TS, inclusive o ciclo vindo da rede, que não esconde ninguém.
- [ ] A principal mostra "n/m" e a pizza das subtarefas diretas; os grupos e a contagem contam só as linhas.
- [ ] As gavetas começam abertas, inclusive as aninhadas.
- [ ] Cada subtarefa na gaveta mostra glifo, nome (que leva ao detalhe) e o quando, sem "Sem data".
- [ ] O glifo de uma subtarefa de pessoa abre o seletor de status e grava com a revisão dela.
- [ ] Sem a principal na lista (por filtro, por executor ou principal sem status), a subtarefa volta a ser linha.
