# 34: Detalhe do artefato

**What to build:** O usuário abre um artefato e vê o conteúdo conforme o tipo, e em quais eventos ele aparece.

**Blocked by:** 33 (Aba Notas lista artefatos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 67 e 71, “Artefatos”. Glossário: Artefato, Artefato global, Relação.

- [ ] O detalhe mostra o conteúdo conforme o tipo: texto, alimento (com totais e receita), sono, treino, exercício, e skill ou agente (o arquivo para o qual apontam).
- [ ] Uma seção lista os eventos em que o artefato aparece, cada um com o código da relação, e tocar num deles abre o detalhe do evento.
- [ ] Um artefato global mostra “catálogo global” e não tem ações de editar nem de apagar.
- [ ] O Registro mostra a criação e a última alteração.
- [ ] Artefato inexistente mostra a tela de não encontrado.
- [ ] O teste de tela cobre um artefato próprio com eventos e um global.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
