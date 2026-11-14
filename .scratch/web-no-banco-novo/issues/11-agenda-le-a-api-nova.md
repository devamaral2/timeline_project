# 11: Agenda lê a API nova

**What to build:** A agenda carrega os eventos pela rota nova e desenha cada um com a linha única. Os eventos de pessoa e de agente aparecem juntos, em ordem de horário.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags); 10 (Linha única das listas)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 18 a 22 e 25, “Agenda”. Canvas: quadro Agenda. Glossário: Agenda, Evento de referência, Evento longo, Passo.

- [ ] A agenda busca a janela pelo cliente da API e mostra todas as páginas.
- [ ] Cada ocorrência de uma série aparece no seu dia.
- [ ] Evento de referência aparece com o ponto azul; evento `missed` mostra “Não realizado”.
- [ ] Evento longo e passo não aparecem, mesmo que venham na resposta.
- [ ] O título com o dia sai do cabeçalho; a tira da semana continua.
- [ ] Os estados de carregando, erro e dia vazio continuam existindo.
- [ ] Um evento que atravessa a meia-noite continua aparecendo nos dias que ocupa.
- [ ] O teste de tela usa a API falsa e confere a ordem e o conteúdo das linhas.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
