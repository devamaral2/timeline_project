# 09: Glifos de status e ícones de tipo

**What to build:** Passam a existir os símbolos que a linha e o detalhe usam: o glifo de cada status, o ícone de cada tipo com o código ao lado e o indicador de prioridade.

**Blocked by:** 02 (Web usa os contratos compartilhados)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Canvas: quadros Status e Tipos. Glossário: Executor, Evento de referência.

- [x] Há um glifo para cada status de pessoa (`todo`, `toDefine`, `doing`, `inHold`, `done`, `cancel`, `missed`), um ponto azul para o evento de referência (sem status) e um para cada status de agente (`queued`, `running`, `waiting`, `done`, `failed`, `cancel`).
- [x] O glifo nunca fica dentro de uma moldura ou de um quadrado.
- [x] Cada glifo tem nome acessível: “A fazer”, “Sem data”, “Em curso”, “Em espera”, “Feito”, “Cancelado”, “Não realizado”, “Só agenda”; e, no agente, “Agente, na fila”, “Agente, executando”, “Agente, aguardando você”, “Agente, feito”, “Agente, falhou”, “Agente, cancelado”.
- [x] Cada tipo tem ícone e o código escrito em fonte mono ao lado: `routine`, `meal`, `sleep`, `training`, `request`, `search_request`, `build_request`, `inquiry_request`, `review_request`, `cron` e `step`.
- [x] A prioridade tem quatro níveis (urgente, alta, média, baixa), com um indicador de quatro barras.
- [x] Os testes conferem o nome acessível de cada status e o código de cada tipo.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
