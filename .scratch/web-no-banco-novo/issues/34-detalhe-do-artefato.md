# 34: Detalhe do artefato

**What to build:** O usuário abre um artefato e vê o conteúdo conforme o tipo, e em quais eventos ele aparece.

**Blocked by:** 33 (Aba Notas lista artefatos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 67 e 71, “Artefatos”. Glossário: Artefato, Artefato global, Relação.

- [x] O detalhe mostra o conteúdo conforme o tipo: texto, alimento (com totais e receita), sono, treino, exercício, e skill ou agente (o arquivo para o qual apontam).
- [x] Uma seção lista os eventos em que o artefato aparece, cada um com o código da relação, e tocar num deles abre o detalhe do evento.
- [x] Um artefato global mostra “catálogo global” e não tem ações de editar nem de apagar.
- [x] O Registro mostra a criação e a última alteração.
- [x] Artefato inexistente mostra a tela de não encontrado.
- [x] O teste de tela cobre um artefato próprio com eventos e um global.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
