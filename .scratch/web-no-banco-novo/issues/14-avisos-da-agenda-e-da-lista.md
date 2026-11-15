# 14: Avisos a partir da agenda e da lista de tarefas

**What to build:** Os avisos antes dos eventos continuam chegando, agora calculados a partir da janela da agenda e da lista de tarefas da API nova.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 27, “Agenda” (último item). TDD: “Consulta de cada tela” (parágrafo dos avisos).

- [x] As fontes dos avisos são a agenda e a lista de tarefas, lidas pelo cliente da API; nenhuma rota antiga é chamada.
- [x] Um evento que está nas duas fontes gera cada aviso uma vez só.
- [x] O aviso sai dos minutos de antecedência do evento, contados a partir do início; no evento longo, a partir do prazo.
- [x] Os testes que já existem para os avisos passam com os dados no formato novo.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
