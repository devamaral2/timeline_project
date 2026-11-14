# 22: Detalhe: artefatos do evento

**What to build:** O detalhe do evento mostra os artefatos ligados a ele, na ordem da lista, com o tipo, de quem são e a relação.

**Blocked by:** 20 (Rota única de detalhe do evento)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 34. Canvas: quadro Detalhe · leitura (Artefatos). Glossário: Artefato, Relação, Artefato global.

- [ ] A seção Artefatos mostra a contagem e, para cada um: a posição, o nome, o código do tipo, “seu artefato” ou “catálogo global” e o código da relação (`uses`, `creates`, `updates`, `deletes`).
- [ ] A ordem é a que veio no evento; artefato sem posição mostra “—” e “sem posição na lista”.
- [ ] Tocar num artefato abre o detalhe dele.
- [ ] Evento sem artefatos não mostra a seção.
- [ ] O teste de tela cobre um evento com artefato próprio, global e sem posição.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
