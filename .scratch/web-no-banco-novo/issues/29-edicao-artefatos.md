# 29: Edição: ligar, reordenar e remover artefatos

**What to build:** No modo de edição, o usuário busca um artefato seu para ligar ao evento, reordena a lista e remove uma ligação.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar); 22 (Detalhe: artefatos do evento); 04 (Cliente da API e API falsa: artefatos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 48. Canvas: quadro Detalhe · edição (Artefatos). Glossário: Artefato, Relação.

- [ ] “Buscar artefato para ligar” procura nos artefatos do usuário por texto.
- [ ] O artefato escolhido entra no fim da lista, com a relação `uses`.
- [ ] A lista pode ser reordenada; a ordem enviada é a ordem da lista.
- [ ] Remover desfaz a ligação; o artefato não é apagado.
- [ ] As mudanças vão no mesmo Salvar do formulário.
- [ ] O teste de tela confere o corpo enviado depois de ligar, reordenar e remover.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
