# 32: Criação de evento pelo formulário

**What to build:** O usuário cria um evento com o mesmo formulário da edição, com ou sem status. A escolha entre Tarefa e Evento sai do painel de criação.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 51 e 53, “Detalhe e formulário do evento”. Glossário: Evento, Evento de referência.

- [ ] O painel de criação oferece Evento e Nota; a opção Tarefa não existe mais.
- [ ] O formulário de criação é o da edição, vazio; sem status, o evento criado é um evento de referência.
- [ ] Criar a partir de uma janela livre da agenda abre o formulário com o início e o fim preenchidos.
- [ ] A chave de idempotência é a mesma enquanto o formulário está aberto: tocar em Salvar duas vezes cria um evento só.
- [ ] Depois de criar, o usuário volta para a tela de onde veio e o evento aparece nela.
- [ ] O teste de tela confere o corpo enviado e o toque repetido.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
