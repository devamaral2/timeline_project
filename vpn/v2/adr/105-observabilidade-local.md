# ADR-105 — Observabilidade local com VictoriaMetrics, VictoriaLogs e Tempo

**Status:** aceita · **Data:** 2026-08-31
**Supersede:** [ADR-005 — Grafana Cloud com Alloy local](../../docs/adr/005-victoriametrics.md)

## Contexto

A ADR-005 escolheu Grafana Cloud com um argumento de uma linha só: a stack local
reservava ~1,1 GiB num servidor de 4 GiB. Ela listou como gatilho de revisão exatamente
o que aconteceu — *"o VPS crescer e houver justificativa educacional para a stack local"*.

Além do espaço, mudou o sistema. As rotas de IA passam por um proxy de modelos e por
provedores externos, e o caminho crítico tem nove saltos. Métrica agregada dá a soma;
para dar a divisão é preciso **tracing distribuído**, que não estava no desenho anterior.

## Decisão

Rodar a stack no cluster: **Alloy** para coleta, **VictoriaMetrics** para métricas
(90 dias), **VictoriaLogs** para logs (14 dias), **Tempo** para traces (3 dias) e
**Grafana** para visualização. Manter **uma sonda externa gratuita** apontando para o
health público.

A stack sobe na Fase 2, **antes** das migrações de produção.

## Alternativas consideradas

**Continuar no Grafana Cloud.** Continua correta, e é a escolha certa para quem não quiser
operar retenção, disco e upgrade de quatro componentes. Descartada porque o motivo
original era exclusivamente memória, e ele deixou de existir. Voltar é barato: o Alloy faz
`remote_write` para dois destinos.

**Prometheus e Loki.** Os padrões de fato, com mais material e mais presença em vagas.
Descartados por consumo, e porque PromQL — o que de fato transfere como aprendizado —
continua sendo a linguagem do VictoriaMetrics.

**`kube-prometheus-stack`.** Tudo funcionando numa instalação, com dezenas de dashboards
prontos. Descartado por entregar exatamente o que a spec quer evitar: um sistema que
funciona sem você saber como.

**Híbrido: local para explorar, Cloud para alertar.** Mais robusto — os alertas
sobreviveriam à queda do host. Descartado por duplicar o pipeline e as regras. A sonda
externa cobre o caso crítico por muito menos.

**Sem tracing.** Seria consistente com o v1. Descartado porque tracing é a razão principal
de trazer a stack para casa.

## Consequências

**Positivas.** Tracing distribuído, que responde perguntas que os outros dois sinais não
respondem. Retenção e cardinalidade sob seu controle. Nenhum dado de telemetria sai do
servidor, o que simplifica a conversa de LGPD. Custo por lane de LLM no mesmo Grafana que
a memória dos pods, permitindo cruzar os dois.

**Negativas.** ~1,4 GiB de piso e 45 GiB de disco. Quatro componentes para atualizar. E a
perda que importa: **quando o VPS cair, os dashboards e os alertas caem junto** — exatamente
quando são mais necessários.

**Mitigação.** A sonda externa é a única peça fora do servidor, e é a única que detecta a
queda completa. A lição do v1 continua inteira: um monitor dentro do VPS não detecta a
queda do VPS.

## Quando revisitar

- Se operar quatro componentes passar a incomodar mais do que os dados valem.
- Se o disco da observabilidade competir com o do banco.
- Se um segundo servidor aparecer — aí a stack pode morar nele, recuperando a propriedade
  de sobreviver à queda do primeiro.
