# 05: Menu da seção e filtro de executor

**What to build:** Tocar de novo na aba atual abre o menu da seção, que cresce para cima: título com contagem, listas Todos, Você e Agentes, busca por texto e "Limpar filtros". A escolha de executor vale para as três seções e sobrevive ao fechar o app. Com filtro ativo, a aba mostra um ponto. Neste ticket o menu filtra a Agenda.

**Blocked by:** 03

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Telas e adaptações ao Android". No web: o menu da seção, a navegação mobile e o modo de visualização.

- [x] Tocar na aba já selecionada abre o menu; tocar fora ou no voltar do sistema o fecha.
- [x] Todos, Você e Agentes filtram pela regra do web (skill, agente e roteador contam como "Agentes"), portada e conferida contra fixtures do TS.
- [x] A escolha de executor fica no DataStore e é a mesma nas três seções.
- [x] A busca filtra as tarefas carregadas da Agenda por texto.
- [x] O menu aceita listas extras e engrenagem por seção (usados nos tickets 06, 07 e 11).
- [x] "Limpar filtros" volta ao padrão; um ponto na aba indica filtro ativo.
