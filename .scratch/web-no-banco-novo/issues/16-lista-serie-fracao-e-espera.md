# 16: Lista de tarefas: série uma vez, fração e espera

**What to build:** Na lista de tarefas, uma série aparece uma vez só, um evento com subtarefas mostra quanto já foi feito e um evento em espera diz por quantos eventos espera.

**Blocked by:** 15 (Lista de tarefas lê a API nova, em seis grupos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 9 a 11, “Lista de tarefas”. TDD: “O que o cartão das listas lê”. Canvas: quadro Tarefas.

- [ ] Se vierem várias ocorrências em aberto da mesma série, a lista mostra só a mais próxima, com a regra no lugar do horário.
- [ ] A fração de subtarefas (“1/3”) é calculada com os eventos da lista que apontam para o evento como pai.
- [ ] Um evento sem subtarefas não mostra fração.
- [ ] Um evento em espera com bloqueios mostra “Espera por N evento(s)”.
- [ ] O teste de tela cobre os três casos.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
