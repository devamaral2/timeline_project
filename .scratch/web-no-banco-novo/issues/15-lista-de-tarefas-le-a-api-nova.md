# 15: Lista de tarefas lê a API nova, em seis grupos

**What to build:** A lista de tarefas carrega os eventos com status pela rota nova, de pessoa e de agente, e os agrupa como o canvas desenhou.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags); 10 (Linha única das listas)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 1 a 5, “Lista de tarefas” (tabela dos grupos). Canvas: quadro Tarefas.

- [x] Os grupos são, nesta ordem: Em curso (`doing`, `running`), A fazer (`todo`, `queued`), Sem data (`toDefine`), Em espera (`inHold`, `waiting`), Feitas (`done`) e Encerradas (`cancel`, `missed`, `failed`).
- [x] Cada grupo mostra a contagem; grupo vazio não aparece.
- [x] Feitas e Encerradas vêm recolhidos e abrem ao toque.
- [x] Eventos de agente aparecem em cartões verde-água, no mesmo grupo dos de pessoa.
- [x] O grupo “Agendadas” não existe mais.
- [x] Um evento que é subtarefa de outro evento da lista não aparece como linha própria, como hoje.
- [x] Os estados de carregando, erro e lista vazia continuam existindo.
- [x] O teste de tela usa a API falsa e confere os grupos e a ordem.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
