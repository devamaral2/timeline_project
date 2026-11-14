# 15: Lista de tarefas lê a API nova, em seis grupos

**What to build:** A lista de tarefas carrega os eventos com status pela rota nova, de pessoa e de agente, e os agrupa como o canvas desenhou.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags); 10 (Linha única das listas)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 1 a 5, “Lista de tarefas” (tabela dos grupos). Canvas: quadro Tarefas.

- [ ] Os grupos são, nesta ordem: Em curso (`doing`, `running`), A fazer (`todo`, `queued`), Sem data (`toDefine`), Em espera (`inHold`, `waiting`), Feitas (`done`) e Encerradas (`cancel`, `missed`, `failed`).
- [ ] Cada grupo mostra a contagem; grupo vazio não aparece.
- [ ] Feitas e Encerradas vêm recolhidos e abrem ao toque.
- [ ] Eventos de agente aparecem em cartões verde-água, no mesmo grupo dos de pessoa.
- [ ] O grupo “Agendadas” não existe mais.
- [ ] Um evento que é subtarefa de outro evento da lista não aparece como linha própria, como hoje.
- [ ] Os estados de carregando, erro e lista vazia continuam existindo.
- [ ] O teste de tela usa a API falsa e confere os grupos e a ordem.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
