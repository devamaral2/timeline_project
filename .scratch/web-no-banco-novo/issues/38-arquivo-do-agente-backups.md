# 38: Arquivo do agente: backups e restauração

**What to build:** O dono vê os backups de um arquivo do agente e restaura um deles.

**Blocked by:** 37 (Arquivo do agente: texto atual)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 79 e “Notas” (escolhas sem quadro no canvas). ADR 0005.

- [x] O detalhe do arquivo lista os backups, do mais novo para o mais antigo.
- [x] Cada backup mostra a data e o tamanho. A API não devolve o texto de um backup, então ele não é mostrado antes de restaurar.
- [x] Restaurar tem confirmação; depois dela, o detalhe mostra o texto restaurado.
- [x] O texto substituído aparece como um backup novo, para a restauração poder ser desfeita.
- [x] A seção não aparece para quem não é o dono.
- [x] A seção segue o desenho atual do detalhe da nota de arquivo; não há quadro no canvas.
- [x] O teste de tela cobre listar, restaurar e desfazer.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
