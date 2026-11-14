# 31: Edição: recorrência

**What to build:** No modo de edição, o usuário cria, altera e apaga a série de um evento, e vê se a ocorrência aberta segue a série ou foi destacada dela.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 05 (Cliente da API e API falsa: séries)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 44, “Detalhe e formulário do evento”. TDD: “Recorrência”. Canvas: quadro Detalhe · edição (Recorrência).

- [ ] Num evento sem série, a linha Recorrência permite criar uma: frequência, intervalo, dia, hora, duração, início e fim opcional.
- [ ] A série criada copia do evento o tipo, o nome, a descrição, a prioridade, as tags e os lembretes.
- [ ] Num evento de série, a linha mostra a regra, desde quando vale, se tem fim e “esta ocorrência segue a série” ou que foi destacada.
- [ ] Alterar a regra edita a série com a revisão dela; apagar a série tem confirmação.
- [ ] A linha não aparece em evento longo.
- [ ] O teste de tela cobre criar, alterar e apagar.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
