# 31: Edição: recorrência

**What to build:** O usuário cria um evento que se repete e, numa ocorrência, vê a regra, altera a série ou a apaga.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 05 (Cliente da API e API falsa: séries); 32 (Criação de evento pelo formulário)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 44, “Detalhe e formulário do evento”. TDD: “Recorrência”. Canvas: quadro Detalhe · edição (Recorrência).

- [ ] No formulário de criação, a linha Recorrência permite definir a regra: frequência, intervalo, dia, hora, duração, início e fim opcional.
- [ ] Com a regra definida, Salvar cria a série, com o tipo, o nome, a descrição, a prioridade, as tags e os lembretes do formulário, em vez de um evento avulso.
- [ ] Num evento avulso que já existe, a linha diz que ele não se repete e não oferece criar série: a API não liga um evento existente a uma série.
- [ ] Numa ocorrência, a linha mostra a regra, desde quando vale, se tem fim e “esta ocorrência segue a série” ou que foi destacada.
- [ ] Alterar a regra edita a série com a revisão dela; apagar a série tem confirmação.
- [ ] A linha não aparece em evento longo.
- [ ] O teste de tela cobre criar, alterar e apagar.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
