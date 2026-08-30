# ADR-005 — VictoriaMetrics em vez de Prometheus

**Status:** aceita · **Data:** 2026-08-25

## Contexto

É preciso armazenar séries temporais de métricas do host, dos containers e das
aplicações, com consulta e alertas. O orçamento total de observabilidade é de ~1.1GB
dentro de um servidor de 4GB.

## Decisão

**VictoriaMetrics** (single-node) como banco de séries temporais, com **Grafana Alloy**
como coletor unificado de métricas e logs.

## Alternativas consideradas

**Prometheus.** O padrão de fato, ecossistema maior, o que aparece em vagas e
documentação. Consome cerca do dobro da memória do VictoriaMetrics para a mesma carga e
comprime pior em disco. Para retenção longa exige um componente adicional (Thanos,
Cortex). Em 4GB, a diferença de 150–250MB é significativa.

**Ponto decisivo:** o VictoriaMetrics implementa **a mesma API e a mesma linguagem de
consulta (PromQL)**. Dashboards da comunidade funcionam sem adaptação, e o PromQL que você
aprende transfere integralmente para qualquer ambiente com Prometheus. O custo de
aprendizado da substituição é praticamente zero — você aprende a mesma coisa gastando
metade da RAM.

**Grafana Mimir.** Projetado para escala horizontal e multi-tenant. Complexidade e
consumo desproporcionais para um servidor único.

**InfluxDB.** Bom banco de séries temporais, mas usa Flux/InfluxQL em vez de PromQL — o
aprendizado não transfere e os dashboards prontos da comunidade não servem.

**Netdata.** Um container só, dashboards excelentes imediatamente, configuração quase
zero. Duas ressalvas: retenção local curta (reter mais exige o serviço pago deles) e não
agrega logs. Se o objetivo fosse apenas "ver se está tudo bem agora", seria a escolha mais
eficiente.

**Grafana Cloud (free tier).** Só o agente local (~130MB), dados na nuvem. Tem uma
vantagem real e subestimada: **se o VPS morrer, os dados sobrevivem** — e você consegue
investigar por que ele morreu, o que é impossível quando a observabilidade cai junto.
Descartado como padrão por criar dependência de terceiro e reduzir o aprendizado
operacional. Documentado como alternativa A na
[Fase 8](../10-fase-8-observabilidade.md).

**Não ter métricas.** Economiza ~1.1GB e significa descobrir problemas por reclamação de
usuário. Descartado, mas a alternativa leve (Uptime Kuma + Dozzle, ~150MB) fica
documentada como opção B.

## Consequências

**Positivas.** Metade da memória do Prometheus para a mesma função. Melhor compressão em
disco, permitindo 30 dias de retenção sem componente extra. PromQL preservado — aprendizado
e dashboards transferem. Um binário, sem dependências.

**Negativas.** Comunidade menor: menos respostas prontas quando algo der errado. Alguns
recursos avançados do Prometheus não têm paridade exata. É "o não-padrão" — em entrevista,
você explica a escolha em vez de apenas citar a ferramenta (o que, dito isso, costuma
impressionar mais).

## Quando revisitar

- Se algum recurso específico do Prometheus fizer falta, a migração é direta (mesma API)
- Se o servidor crescer para 16GB, Prometheus volta a ser confortável
- Se a stack local passar de ~800MB reais, migre para Grafana Cloud (alternativa A)
