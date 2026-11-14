# 32: Criação de evento pelo formulário

**What to build:** O usuário cria um evento com o mesmo formulário da edição, com ou sem status. A escolha entre Tarefa e Evento sai do painel de criação.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 51 e 53, “Detalhe e formulário do evento”. Glossário: Evento, Evento de referência.

- [x] O painel de criação oferece Evento e Nota; a opção Tarefa não existe mais.
- [x] O formulário de criação é o da edição, vazio; sem status, o evento criado é um evento de referência.
- [x] A janela livre da agenda continua abrindo o chat do agente; ela não passa a abrir este formulário.
- [x] A chave de idempotência é a mesma enquanto o formulário está aberto: tocar em Salvar duas vezes cria um evento só.
- [x] Depois de criar, o usuário volta para a tela de onde veio e o evento aparece nela.
- [x] O teste de tela confere o corpo enviado e o toque repetido.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
