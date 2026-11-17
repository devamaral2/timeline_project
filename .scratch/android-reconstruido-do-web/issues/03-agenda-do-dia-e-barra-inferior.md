# 03: Agenda do dia com a barra inferior

**What to build:** Depois de entrar, o usuário cai na Agenda: vê as tarefas de pessoa e de agente do dia, troca de dia pela faixa da semana, pelo mês, por "Hoje" ou com swipe, e tem a barra inferior com Tarefas, Agenda e Documentos e o botão do agente ao lado. Tarefas e Documentos ainda abrem telas vazias; o botão do agente ainda não abre nada.

**Blocked by:** 01

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Telas e adaptações ao Android", "Lógica portada à mão". No web: o shell e a navegação mobile, a Agenda e os componentes de semana, seletor de dia e linha da tarefa; `packages/timeline`.

- [x] A Agenda lê `GET /api/tasks` com a janela do dia (paginando pelo cursor) e mostra cada tarefa com glifo do executor, ícone do tipo, horário, duração e tags, nas cores de tag do web.
- [x] Tarefas longas e passos não aparecem; uma tarefa que cruza a meia-noite aparece nos dois dias.
- [x] Faixa da semana, seletor de mês com "Hoje" e swipe horizontal trocam o dia.
- [x] Esqueleto enquanto carrega; erro com "Tentar de novo" quando a rede falha.
- [x] A barra inferior tem Tarefas, Agenda e Documentos com os ícones do web, rótulo só na aba atual e o botão do agente separado.
- [x] O voltar do sistema na Agenda sai do app.
- [x] As funções portadas de `packages/timeline` (chaves de dia, fuso de São Paulo, semana, deslocamento, início e fim do dia, formatação, dias de uma tarefa, posições) e `hueForTag` passam contra fixtures geradas pelo TS.

## Notas da entrega

- Sem emulador na sessão: o app não foi rodado nem comparado lado a lado com o web (screenshots pendentes).
- Segue o web onde o ticket diverge: a linha da tarefa mostra as tags em `#tag` no cinza de apoio, como o `TaskRow` do web;
  `hueForTag` e `tagColors` estão portados e testados, e as cores de tag aparecem nos filtros e na edição (tickets 07 e 13).
- O resumo do dia e os botões "Por dia" / "Em sequência" não existem no celular do web (a barra some a 720 px), então o app não os tem.
