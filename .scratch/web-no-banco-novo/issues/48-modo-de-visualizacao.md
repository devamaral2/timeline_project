# 48: Modo de visualização filtra as duas listas

**What to build:** A agenda e a lista de tarefas passam a ter três modos: os seus eventos, os eventos dos agentes e todos. O modo em uso filtra as duas listas e dá cor à aba selecionada.

**Blocked by:** 11 (Agenda lê a API nova); 15 (Lista de tarefas lê a API nova, em seis grupos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 82, 85 e 86, “Modos de visualização”. Canvas: quadro Menu de modos (parte “A cor da aba em cada modo”). Glossário: Executor.

- [x] Há três modos fixos: “Todos os seus eventos” (pessoa), “Todos os eventos de agentes” (agente) e “Todos os eventos” (sem filtro).
- [x] O modo vai como filtro de executor na consulta da agenda e na da lista de tarefas.
- [x] O modo escolhido fica guardado no navegador e vale para as duas listas; sem escolha guardada, vale “Todos os eventos”.
- [x] A aba selecionada usa a cor do modo: uma para pessoa, verde-água para agentes e uma terceira, própria, para todos, que não é mistura das outras duas.
- [x] As cores ficam no estilo do web; o pacote de tema compartilhado não muda.
- [x] Não há modos configuráveis nem a linha “Novo modo”.
- [x] O teste de tela confere o parâmetro enviado em cada modo e a persistência.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
