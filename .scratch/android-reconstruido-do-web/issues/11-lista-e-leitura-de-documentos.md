# 11: Lista e leitura de Documentos

**What to build:** Na aba Documentos, o usuário vê os documentos filtrados por tipo, tag, texto e executor e abre cada um: texto em markdown renderizado, alimento com calorias, macros, ingredientes e receita (com "calculando" até o agente terminar), sono, treino e exercício. O detalhe mostra as tarefas ligadas com a relação e o registro. Documentos globais são só leitura.

**Blocked by:** 05

**Status:** done

**Leia antes:** o [README](README.md). No web: a tela de notas (Documentos), o detalhe do artefato e o conteúdo de cada tipo.

- [x] A lista lê `GET /api/artifacts` com tipo, tag, texto e `scope=global` quando aplicável; o menu da seção tem as listas do web.
- [x] O detalhe lê `GET /api/artifacts/{id}` e mostra o conteúdo de cada tipo como no web, num componente de conteúdo reutilizável pelo detalhe da tarefa (ticket 16).
- [x] O markdown renderiza títulos, listas, ênfase, código e links.
- [x] O alimento em cálculo mostra "calculando" e consulta até terminar, parando se a tela sai de vista.
- [x] As tarefas ligadas aparecem com a relação e levam ao detalhe delas.
- [x] Documentos globais e de outros donos não mostram ações de editar ou excluir.
