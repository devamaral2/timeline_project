# 24: Edição: campos básicos, Descartar e Salvar

**What to build:** O lápis do detalhe abre o modo de edição do evento de pessoa, em que cada campo é uma entrada e o rodapé tem só Descartar e Salvar.

**Blocked by:** 20 (Rota única de detalhe do evento)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 39 a 42 e 52, “Detalhe e formulário do evento”. Canvas: quadro Detalhe · edição.

- [ ] O cabeçalho diz “Editar evento” e não tem botões; o rodapé tem só Descartar e Salvar.
- [ ] São editáveis: tipo (`routine`, `meal`, `sleep`, `training`), título, status (os sete, ou sem status), prioridade (quatro níveis), início e fim planejado com data e hora, e descrição.
- [ ] Um dia sem hora grava o início à meia-noite local; apagar uma data a remove do evento.
- [ ] Salvar envia só os campos que mudaram, com a revisão lida, e volta para a leitura.
- [ ] Diante de revisão desatualizada, a tela avisa, recarrega o evento e mantém o que o usuário digitou.
- [ ] Entrada recusada pela API aparece como mensagem no formulário, sem perder o que foi digitado.
- [ ] Descartar volta para a leitura sem enviar nada.
- [ ] O teste de tela confere o corpo enviado e o caso de revisão desatualizada.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
