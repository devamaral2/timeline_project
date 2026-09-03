# Spec v2 — Time Composure sobre k3s num VPS de 16 GiB

Guia de estudo e execução para migrar a aplicação de Docker Compose para **k3s**,
colocar um **gateway de modelos** na frente das rotas de IA, trocar a observabilidade
hospedada por uma **stack própria com tracing**, substituir o deploy por SSH por
**GitOps**, ganhar um ambiente de **staging** e publicar a **API para o app mobile**.

## O que mudou em relação ao v1

A spec em [`../docs/`](../docs/) foi escrita para um VPS de 4 GiB. Sob aquela restrição
ela decidiu, corretamente: Compose em vez de Kubernetes, Grafana Cloud em vez de stack
local, deploy push por SSH. O servidor agora tem **16 GiB**, e as três decisões mudam de
resposta.

O ponto de partida também é outro. O v1 começava num VPS cru; o v2 assume:

- monorepo configurado, imagens construídas no CI e publicadas no GHCR;
- web e API rodando em produção;
- PostgreSQL e Redis **em uso pela aplicação**, não mais ociosos.

O v1 continua no repositório como histórico. Ele não está errado — está dimensionado para
outro servidor.

## Estados das fases

| Fase | Documento | Onde roda | Status |
|---|---|---|---|
| — | [Convenções](00-convencoes.md) | — | Referência |
| — | [Arquitetura e orçamento](01-arquitetura-e-orcamento.md) | — | Referência |
| 0 | [Baseline de 16 GiB](02-fase-0-baseline.md) | 🖥️ servidor | Não iniciada |
| 1 | [k3s instalado e endurecido](03-fase-1-k3s.md) | 🖥️ servidor | Não iniciada |
| 2 | [Observabilidade no cluster](04-fase-2-observabilidade.md) | 🖥️ servidor | Não iniciada |
| 3 | [Ingress e TLS](05-fase-3-ingress-e-tls.md) | 🖥️ servidor | Não iniciada |
| 4 | [Dados no cluster](06-fase-4-dados-no-cluster.md) | 🖥️ servidor | Não iniciada |
| 5 | [web e API no cluster](07-fase-5-web-e-api.md) | 🖥️ servidor | Não iniciada |
| 6 | [Secrets e GitOps](08-fase-6-secrets-e-gitops.md) | 💻 local + 🖥️ servidor | Não iniciada |
| 7 | [LiteLLM e Hermes](09-fase-7-litellm-e-hermes.md) | 💻 local + 🖥️ servidor | Não iniciada |
| 8 | [OTel e observabilidade de LLM](10-fase-8-otel-e-llm.md) | 💻 local + 🖥️ servidor | Não iniciada |
| 9 | [Staging](11-fase-9-staging.md) | 💻 local | Não iniciada |
| 10 | [API pública para o mobile](12-fase-10-api-publica.md) | 💻 local + 🖥️ servidor | Não iniciada |
| 11 | [Corte final](13-fase-11-corte-final.md) | 🖥️ servidor | Não iniciada |
| — | [Checklist de segurança](14-seguranca-checklist.md) | — | Transversal |
| — | [Runbook](15-runbook-operacao.md) | — | Referência |
| — | [Biblioteca de estudo](16-biblioteca-de-estudo.md) | — | Referência |

## Arquitetura alvo

```text
                              INTERNET
                                  |
                    +-------------v-------------+
                    | Traefik (Deployment,      |  hostPort 80/443
                    | cert-manager)             |
                    +------+-------------+------+
                           |             |
              Ingress app.dominio   Ingress api.dominio (mobile)
                           |             |
                    +------v-----+  +----v------+
                    | web x2     |->| api x2    |
                    | (Next)     |  | (Nest)    |
                    +------------+  +--+-----+--+
                                       |     |
                          NetworkPolicy|     |
                          +------------v-+ +-v-------------+
                          | postgres     | | litellm proxy |
                          | redis        | +-------+-------+
                          +--------------+         |
                                            OpenRouter / Nous (Hermes)

  kubelet+cAdvisor, kube-state-metrics, node-exporter, /metrics da api e do litellm,
  logs dos pods, traces OTLP  ->  Alloy  ->  VictoriaMetrics | VictoriaLogs | Tempo
                                                        \-> Grafana (Ingress + auth)

  sonda externa gratuita -> https://app.dominio/health     (detecta queda do host)
  Flux <- git (deploy/) : manifestos, HelmReleases, secrets SOPS, alertas
```

## Ordem de execução

```text
Fase 0 -> Fase 1 -> Fase 2 -> Fase 3 -> Fase 4 -> Fase 5 -+-> Fase 6 -> Fase 7 -> Fase 8
                                                          |
                                                          +-> Fase 9
                                                          +-> Fase 10
                                                                        Fase 11 (último)
```

A Fase 2 vem antes das migrações de propósito, invertendo a escolha do v1: migrar carga de
produção sem enxergar latência, memória e erro é migrar às cegas. As fases 9 e 10 só
dependem do corte da Fase 5; a 11 é a última porque desliga o Compose.

## Regras de ouro

1. O VPS nunca compila o monorepo; ele só baixa imagens prontas do GHCR.
2. Apenas 22, 80 e 443 ficam abertas no host. O `6443` do k3s não é exceção — `kubectl`
   entra por túnel SSH.
3. Todo workload tem `requests` **e** `limits`. `requests` sem `limits` é um vazamento
   esperando acontecer; `limits` sem `requests` é uma promessa que o scheduler não fez.
4. PostgreSQL não muda de casa antes de um restore testado a partir do armazenamento
   externo — a mesma regra do v1, agora com um banco que tem dado real dentro.
5. Segredos nunca entram no git em texto claro. Com SOPS, entram criptografados — o que é
   diferente de não entrarem.
6. Prompt de LLM contém dado pessoal. Ele não vira log indexado nem label de métrica.
7. Uma fase só termina quando sua seção 5 (verificação) tiver sido executada e o
   checklist correspondente, preenchido.

As decisões de arquitetura vivem em [`adr/`](adr/) e os critérios de aceite em
[`checklists/`](checklists/).
