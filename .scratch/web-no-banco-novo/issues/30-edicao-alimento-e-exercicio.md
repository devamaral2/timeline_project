# 30: Edição: alimento na refeição e exercício no treino

**What to build:** Numa refeição, o usuário adiciona um alimento do catálogo global ou dos seus, com a quantidade. Num treino, adiciona exercícios do catálogo global, na ordem.

**Blocked by:** 29 (Edição: ligar, reordenar e remover artefatos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 49 e 50, “Detalhe e formulário do evento”. Glossário: Alimento, Artefato global.

- [x] Em evento `meal`, a busca de artefato oferece os alimentos do catálogo global e os do usuário.
- [x] O alimento escolhido entra como cópia do original, com a quantidade informada; editar o original depois não muda a refeição.
- [x] A cópia não aparece na lista de artefatos da aba Notas.
- [x] A refeição mostra o total de calorias, que é a soma dos alimentos ligados.
- [x] Em evento `training`, a busca oferece os exercícios do catálogo global, e o exercício entra por referência, na ordem da lista.
- [x] O teste de tela cobre uma refeição e um treino.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
