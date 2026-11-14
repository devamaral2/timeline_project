# 08: Textos calculados da linha

**What to build:** Os textos que a linha das listas mostra e que não vêm prontos da API passam a sair de funções puras, que recebem o cartão de evento do contrato e o instante atual.

**Blocked by:** 02 (Web usa os contratos compartilhados)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “A linha das listas”. TDD: “O que o cartão das listas lê” e “Regras que ficam no código”. Canvas: quadros Tarefas, Agenda e Status (parte “Calculado na tela”).

- [ ] A fazer com hora mostra o dia e a hora (“Hoje, 09:00”); o antigo status “agendado” não existe.
- [ ] Um evento com dia e sem hora (início à meia-noite local) mostra só o dia (“Hoje”).
- [ ] A fazer cujo dia já passou mostra “Era ontem” (ou a data) e conta como atrasado.
- [ ] Evento longo mostra “Prazo 30 nov”; com o prazo vencido, conta como atrasado.
- [ ] Evento sem data mostra “Sem data”.
- [ ] Ocorrência de série mostra a regra (“Todo dia, 18:00”) quando a lista pede a regra no lugar do horário.
- [ ] Evento de agente mostra o tempo decorrido desde o início (“há 12 min”), “na fila · há 3 min” na fila e “aguarda sua resposta” quando aguarda.
- [ ] A duração é o fim planejado menos o início (“1h30”, “50 min”); sem os dois, não há duração.
- [ ] Evento em espera com bloqueios mostra “Espera por 1 evento”, pela contagem de bloqueadores.
- [ ] Os testes fixam o relógio e o fuso, e cobrem cada caso acima.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
