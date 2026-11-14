# 38: Arquivo do agente: backups e restauração

**What to build:** O dono vê os backups de um arquivo do agente e restaura um deles.

**Blocked by:** 37 (Arquivo do agente: texto atual)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 79 e “Notas” (escolhas sem quadro no canvas). ADR 0005.

- [ ] O detalhe do arquivo lista os backups, do mais novo para o mais antigo.
- [ ] O dono abre um backup para ler o texto antes de restaurar.
- [ ] Restaurar tem confirmação; depois dela, o detalhe mostra o texto restaurado.
- [ ] O texto substituído aparece como um backup novo, para a restauração poder ser desfeita.
- [ ] A seção não aparece para quem não é o dono.
- [ ] A seção segue o desenho atual do detalhe da nota de arquivo; não há quadro no canvas.
- [ ] O teste de tela cobre listar, restaurar e desfazer.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
