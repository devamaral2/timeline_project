# Spec: monorepo em produção num VPS de 4GB

Guia de estudo **e** de execução para colocar aplicações Node no ar num VPS HostGator
de 4GB, usando pnpm workspaces + Turborepo, Docker Compose, Traefik, Postgres, Redis
e observabilidade self-hosted.

Não é um tutorial de copiar e colar. Cada documento explica **por que** o passo existe,
**por que não** fazer de outro jeito, e **como verificar** que deu certo. Se você só
executar os comandos sem ler as seções "Por que", vai conseguir subir o servidor — e
não vai conseguir consertá-lo quando quebrar às 2h da manhã.

---

## Estado atual

| Fase | Documento | Status |
|---|---|---|
| — | [Convenções desta spec](00-convencoes.md) | 📄 Referência |
| — | [Arquitetura e orçamento de RAM](01-arquitetura-e-orcamento.md) | 📄 Referência |
| 0 | [Diagnóstico do VPS e limpeza do k3s](02-fase-0-diagnostico-e-limpeza.md) | ⬜ Não iniciada |
| 1 | [Hardening do sistema operacional](03-fase-1-hardening-do-so.md) | ⬜ Não iniciada |
| 2 | [Docker: instalação e rede](04-fase-2-docker.md) | ⬜ Não iniciada |
| 3 | [Monorepo local: pnpm + Turborepo](05-fase-3-monorepo-local.md) | ⬜ Não iniciada |
| 4 | [Imagens Docker do monorepo](06-fase-4-imagens-docker.md) | ⬜ Não iniciada |
| 5 | [Traefik e TLS](07-fase-5-traefik-e-tls.md) | ⬜ Não iniciada |
| 6 | [Postgres, Redis e backup](08-fase-6-postgres-e-redis.md) | ⬜ Não iniciada |
| 7 | [CI/CD com GitHub Actions](09-fase-7-cicd-github-actions.md) | ⬜ Não iniciada |
| 8 | [Observabilidade](10-fase-8-observabilidade.md) | ⬜ Não iniciada |
| — | [Checklist de segurança](11-seguranca-checklist.md) | 📄 Transversal |
| — | [Runbook de operação](12-runbook-operacao.md) | 📄 Referência |
| — | [Biblioteca de estudo](13-biblioteca-de-estudo.md) | 📄 Referência |

Marque cada fase como ✅ conforme concluir. O checklist de segurança é transversal:
itens dele aparecem dentro de várias fases e são consolidados no final.

**Decisões arquiteturais registradas:** veja [`adr/`](adr/) — 7 documentos curtos
explicando por que cada tecnologia foi escolhida e o que foi descartado.

**Checklists imprimíveis por fase:** veja [`checklists/`](checklists/).

---

## Onde você quer chegar

Uma aplicação Node respondendo `Hello World` em HTTPS, com:

- **Turborepo + pnpm workspaces** organizando o código
- **GitHub Actions** buildando a imagem e publicando no GHCR
- **Traefik v3** como porta de entrada, com TLS automático
- **Postgres 16** e **Redis 7** disponíveis para as apps
- **Grafana + VictoriaMetrics + Loki** mostrando métricas e logs
- Tudo isso em **~2.4GB** dos seus 4GB, com folga para crescer

```
Internet ──▶ :80/:443 ──▶ Traefik ──▶ rede "edge" ──▶ hello-api (Node)
                            │                              │
                            │                        rede "internal"
                            │                         ├── Postgres 16
                            │                         └── Redis 7
                            │
                            └──────────▶ rede "observability"
                                          Grafana · VictoriaMetrics
                                          Loki · Alloy · cAdvisor
```

---

## Ordem de leitura

**Se você tem pressa:** leia [01 — Arquitetura](01-arquitetura-e-orcamento.md) inteiro,
depois execute as fases 0 a 8 na ordem. Não pule a fase 0.

**Se você quer aprender de verdade:** antes de cada fase, leia a seção "Para estudar"
dela e assista/leia pelo menos uma referência. A [biblioteca](13-biblioteca-de-estudo.md)
tem uma trilha sugerida com o que é gratuito marcado.

**As fases têm dependências reais.** A ordem não é arbitrária:

```
Fase 0 (diagnóstico) ──▶ Fase 1 (hardening) ──▶ Fase 2 (Docker)
                                                     │
                            ┌────────────────────────┤
                            ▼                        ▼
                    Fase 3 (monorepo local)   Fase 5 (Traefik)
                            │                        │
                            ▼                        │
                    Fase 4 (imagens) ────────────────┤
                            │                        │
                            ▼                        ▼
                    Fase 7 (CI/CD) ◀── Fase 6 (Postgres/Redis)
                            │
                            ▼
                    Fase 8 (observabilidade)
```

As fases 3 e 4 são feitas **na sua máquina Windows**, sem tocar no servidor. As fases 0,
1, 2, 5, 6 e 8 são no servidor. A fase 7 conecta os dois mundos.

---

## Regras de ouro

Cinco coisas que, se você respeitar, evitam 90% dos problemas em VPS pequeno:

1. **Nunca faça build no servidor.** `turbo build` com TypeScript consome 2–4GB de heap.
   O servidor só faz `docker compose pull`. Ver [ADR-003](adr/003-build-no-ci.md).
2. **Só o Traefik publica portas.** Todo o resto usa redes internas do Docker.
   Ver [Fase 2](04-fase-2-docker.md) — o Docker fura o firewall, e isso surpreende todo mundo.
3. **Todo container tem `mem_limit`.** Sem isso, um vazamento de memória numa app derruba
   o Postgres junto. Ver [Fase 2](04-fase-2-docker.md).
4. **Backup que você nunca restaurou não é backup.** Teste o restore antes de existir
   dado real. Ver [Fase 6](08-fase-6-postgres-e-redis.md).
5. **Segredo nenhum entra no git.** Nem "temporariamente". Git guarda para sempre.
   Ver [Checklist de segurança](11-seguranca-checklist.md).

---

## Contexto: e o repositório `k8`?

Existe uma versão anterior desta mesma ideia usando **k3s** (Kubernetes leve), em
`C:\Users\amara\OneDrive\Documentos\k8`. Ela não foi jogada fora — vários acertos dela
foram reaproveitados aqui: a detecção de mudanças no CI, a disciplina de `*.secret.example`
versionado, o deploy por SSH em vez de expor a API do cluster, e a escolha do
VictoriaMetrics no lugar do Prometheus.

O que mudou foi o alvo: k3s consome 600–800MB só de control plane, e resolve problemas
(autoscaling, self-healing multi-nó, rollout progressivo) que você **não tem** com um
servidor só. Ver [ADR-001](adr/001-docker-compose-vs-k3s.md) para o raciocínio completo.

Guarde aquele repositório. Quando você tiver 3 servidores em vez de 1, ele volta a ser
a resposta certa.
