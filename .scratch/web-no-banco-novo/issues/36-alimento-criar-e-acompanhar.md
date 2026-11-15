# 36: Alimento: criar e acompanhar o cálculo

**What to build:** O usuário cria um alimento descrevendo o que comeu e acompanha o cálculo de calorias até ele terminar.

**Blocked by:** 34 (Detalhe do artefato)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 66, “Artefatos”. Glossário: Alimento.

- [x] Criar um alimento envia só o texto do que foi comido.
- [x] Enquanto o cálculo está pendente, o detalhe diz que está calculando e se recarrega em intervalo.
- [x] Com o cálculo concluído, o detalhe mostra os itens e os totais, e a recarga para.
- [x] Com o cálculo falho, o detalhe diz que falhou.
- [x] O teste de tela avança o relógio e cobre os três estados.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
