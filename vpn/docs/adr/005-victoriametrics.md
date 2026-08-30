# ADR-005 — Grafana Cloud com Alloy local

## Status

Aceita. Substitui a decisão anterior de manter Grafana, VictoriaMetrics e Loki no VPS.

## Contexto

O VPS tem 4 GiB e precisa hospedar web, API, PostgreSQL e Redis, reservando ainda 448 MiB
para futuros serviços de autenticação e filas. A stack de observabilidade local reservava
cerca de 1,1 GiB e desaparecia junto com o servidor durante uma falha total.

## Decisão

Executar apenas Grafana Alloy no VPS, com limite de 192 MiB. Seus componentes internos
coletam métricas do host/containers, raspam `/metrics` da API e enviam logs Docker para
Grafana Cloud.

Não registrar cotas hospedadas no documento, pois elas mudam. A instalação sempre
consulta os [limites oficiais](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/usage-limits/).

## Consequências

Positivas:

- libera RAM para aplicações e page cache do PostgreSQL;
- mantém dados e alertas disponíveis quando o VPS cai;
- elimina volumes e upgrades locais de Grafana, Loki e VictoriaMetrics;
- preserva PromQL, LogQL e dashboards Grafana.

Negativas:

- cria dependência de terceiro e de egresso HTTPS;
- telemetria sai do VPS e precisa respeitar privacidade/LGPD;
- tokens de escrita precisam de rotação e monitoramento;
- socket Docker e mounts do host continuam sendo superfície privilegiada do Alloy.

## Alternativas

**Stack local Grafana + VictoriaMetrics + Loki.** Continua válida para estudo ou
soberania, mas adiciona aproximadamente 768 MiB de limites ao novo desenho e reduz a
folga total para menos de 1 GiB. Exige nova aprovação de orçamento, retenção e backup.

**Somente uptime e logs locais.** Mais leve, porém perde histórico de recursos e dificulta
diagnóstico de OOM, banco lento e falhas intermitentes.

**Nenhuma observabilidade.** Rejeitada: economiza RAM ao custo de descobrir falhas por
reclamação ou perda de dados.

## Gatilhos de revisão

- requisitos de soberania impedirem envio de telemetria;
- custo ou limites do serviço hospedado deixarem de atender;
- o VPS crescer e houver justificativa educacional para a stack local;
- outro provedor hospedado oferecer melhor retenção ou controles.
