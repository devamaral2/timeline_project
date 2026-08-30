# 13 — Biblioteca de estudo

Consolidação das referências espalhadas pelos documentos, organizadas por assunto e por
trilha. 🆓 gratuito · 💰 pago.

Uma lista longa intimida e não é lida. Por isso comece pela trilha sugerida no final —
são poucos itens, na ordem que faz diferença.

---

## Linux e administração de servidor

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **The Linux Command Line** (William Shotts) — linuxcommand.org | Livro | Gratuito em PDF. Melhor porta de entrada para o shell |
| 💰 **How Linux Works** (Brian Ward, 3ª ed.) | Livro | Explica o que acontece no boot, systemd, rede. Excelente para quem usa Linux sem entender |
| 🆓 **DigitalOcean Community Tutorials** | Artigos | Qualidade consistente, atualizados. Busque por tópico específico |
| 🆓 **`man` pages** | Referência | `man sshd_config`, `man ss`, `man iptables`. Subestimadas |
| 🆓 **NetworkChuck** (YouTube) | Vídeo | Didático e energético; bom para SSH, firewall, redes |
| 🆓 **Lynis** | Ferramenta | Auditoria que vira material de estudo dirigido |
| 💰 **Linux Basics for Hackers** (OccupyTheWeb) | Livro | Administração pela ótica ofensiva; fixa por que cada defesa existe |

---

## Docker e containers

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **Docker docs — "Get started"** | Docs | Comece pelo modelo mental antes dos comandos |
| 🆓 **Docker docs — "Packet filtering and firewalls"** | Docs | ⚠️ A página sobre `DOCKER-USER`. Leitura obrigatória da [Fase 2](04-fase-2-docker.md) |
| 🆓 **Docker docs — "Multi-stage builds"** e **"Best practices"** | Docs | 80% do que importa para Dockerfile |
| 💰 **Docker Deep Dive** (Nigel Poulton) | Livro | O melhor introdutório. Curto e bem estruturado |
| 🆓 **TechWorld with Nana** (YouTube) | Vídeo | "Docker Tutorial for Beginners" cobre o modelo inteiro |
| 🆓 **dive** (github.com/wagoodman/dive) | Ferramenta | Explorar camadas de imagem interativamente |
| 🆓 **CIS Docker Benchmark** | Checklist | Hardening de nível profissional. Leia por seção |
| 🆓 **Snyk — "10 best practices for Node.js Docker images"** | Artigo | Específico para Node, foco em segurança |

---

## pnpm, Turborepo e monorepos

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **Turborepo docs — "Core Concepts"** | Docs | Caching e grafo de tarefas. Curto e claro |
| 🆓 **Turborepo docs — "Deploying with Docker"** | Docs | A abordagem `turbo prune`, alternativa ao `pnpm deploy` |
| 🆓 **pnpm docs — "Workspace"** e **"Docker"** | Docs | Protocolo `workspace:`, `--filter`, `pnpm deploy` |
| 🆓 **"Why should I use pnpm?"** (blog do pnpm) | Artigo | Explica a estrutura de `node_modules` com diagramas |
| 🆓 **Jack Herrington** (YouTube) | Vídeo | Série sobre monorepos com Turborepo, exemplos reais |
| 🆓 **monorepo.tools** | Site | Comparativo honesto entre Turborepo, Nx, Lerna, Rush |

---

## Node, TypeScript, NestJS e Next.js

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **NestJS docs — lifecycle events** | Docs | Shutdown hooks e encerramento limpo em containers |
| 🆓 **Next.js docs — self-hosting e standalone output** | Docs | Runtime Docker, tracing e variáveis de ambiente |
| 🆓 **Zod docs** | Docs | `safeParse`, `coerce`, composição de schemas |
| 🆓 **Node.js docs — "Diagnostics"** | Docs | Como investigar vazamento de memória e travamento |
| 💰 **Effective TypeScript** (Dan Vanderkam) | Livro | 62 itens curtos. Os de configuração aplicam-se diretamente |
| 🆓 **Total TypeScript** (Matt Pocock) | Curso | O tier gratuito já cobre bastante; excelente didática |
| 🆓 **The Twelve-Factor App** (12factor.net) | Site | Config em env, logs como stream, processos stateless |

---

## Traefik, TLS e rede

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **Traefik docs — "Getting Started"** e **"Routing"** | Docs | Configuração estática vs dinâmica é o que mais confunde |
| 🆓 **Let's Encrypt — "Rate Limits"** | Docs | ⚠️ Leia **antes** de testar, não depois de ser bloqueado |
| 🆓 **Let's Encrypt — "How It Works"** | Docs | Desafios HTTP-01 e DNS-01. Entender acelera muito o debug |
| 🆓 **Mozilla SSL Configuration Generator** | Ferramenta | Perfis de cifra explicados |
| 🆓 **OWASP Secure Headers Project** | Referência | Cada header, o que protege e o risco de não ter |
| 🆓 **SSL Labs Server Test** | Ferramenta | Nota A+ como meta; o relatório aponta o que falta |
| 🆓 **Techno Tim** (YouTube) | Vídeo | Traefik v3 em homelab, cenário quase idêntico ao seu |
| 🆓 **High Performance Browser Networking** (Ilya Grigorik) | Livro | Gratuito online. Capítulo de TLS é excelente |

---

## Postgres e Redis

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **pgtune** (pgtune.leopard.in.ua) | Ferramenta | Calcula parâmetros para o seu hardware |
| 🆓 **Postgres docs — "Server Configuration"** | Docs | A documentação do Postgres é referência de qualidade |
| 🆓 **Postgres docs — "Backup and Restore"** | Docs | `pg_dump`, `pg_restore`, estratégias de PITR |
| 🆓 **Use The Index, Luke!** (use-the-index-luke.com) | Site | Índices e planos de consulta explicados sem jargão |
| 🆓 **Redis docs — "Security"** | Docs | O ataque via `CONFIG SET` que motivou o `rename-command` |
| 🆓 **Redis docs — "Key eviction"** | Docs | Políticas de `maxmemory` e quando usar cada uma |
| 🆓 **Hussein Nasser** (YouTube) | Vídeo | Pooling de conexões e internos de banco, com profundidade |
| 💰 **PostgreSQL 14 Administration Cookbook** | Livro | Receitas práticas de backup e monitoramento |
| 💰 **The Art of PostgreSQL** (Dimitri Fontaine) | Livro | Para usar o Postgres bem, não só mantê-lo vivo |

---

## CI/CD e GitHub Actions

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **GitHub Actions docs — "Understanding GitHub Actions"** | Docs | Jobs, steps, runners. Comece aqui |
| 🆓 **GitHub Actions — "Security hardening"** | Docs | ⚠️ Secrets, permissões, riscos de Actions de terceiros |
| 🆓 **`man sshd`, seção AUTHORIZED_KEYS FILE FORMAT** | Docs | As restrições `command=`, `no-pty` etc. |
| 🆓 **Trivy docs** | Docs | Interpretar o relatório e usar `.trivyignore` |
| 💰 **Continuous Delivery** (Humble & Farley) | Livro | O livro que definiu a disciplina. Denso mas formativo |

---

## Observabilidade

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **Google SRE Book, cap. 6 "Monitoring Distributed Systems"** | Livro | Gratuito online. Os quatro sinais de ouro. O melhor capítulo sobre o tema |
| 🆓 **"My Philosophy on Alerting"** (Rob Ewaschuk) | Artigo | Curto; muda como você pensa sobre alertas |
| 🆓 **Grafana Loki docs — "Best practices"** | Docs | ⚠️ Cardinalidade de labels. Leia antes de criar labels |
| 🆓 **Prometheus docs — "Querying basics"** | Docs | PromQL usado pelo Grafana Cloud Metrics |
| 🆓 **Grafana Cloud — usage limits** | Docs | Conferir limites atuais antes da instalação |
| 🆓 **Grafana Alloy docs** | Docs | Exporters integrados, Docker logs e remote write |
| 💰 **Observability Engineering** (Majors, Fong-Jones, Miranda) | Livro | A referência moderna |
| 💰 **Systems Performance** (Brendan Gregg) | Livro | Método USE para diagnosticar saturação |

---

## Segurança

| Recurso | Tipo | Nota |
|---|---|---|
| 🆓 **OWASP Top 10** | Referência | As dez categorias mais críticas. Releia anualmente |
| 🆓 **OWASP Cheat Sheet Series** | Referência | Fichas por tema. O que você consulta ao codar |
| 🆓 **CIS Benchmarks** (Ubuntu, Docker) | Checklist | Hardening de auditoria profissional |
| 🆓 **Have I Been Pwned** | Serviço | Alerta se credenciais do seu domínio vazarem |
| 🆓 **Mozilla Infosec Guidelines** | Referência | Recomendações de OpenSSH e TLS com justificativa |
| 💰 **The Web Application Hacker's Handbook** | Livro | Como aplicações web são atacadas na prática |

---

## Arquitetura e fundamentos

| Recurso | Tipo | Nota |
|---|---|---|
| 💰 **Designing Data-Intensive Applications** (Kleppmann) | Livro | O melhor livro de sistemas da última década. Cap. 1 é transformador |
| 🆓 **The Twelve-Factor App** | Site | Curto, formativo, aplicável imediatamente |
| 🆓 **Google SRE Book** (sre.google/books) | Livro | Gratuito. Leia por capítulo conforme a necessidade |
| 🆓 **ADR GitHub organization** (adr.github.io) | Referência | Formatos de Architecture Decision Record |

---

## Trilha sugerida

A lista acima é para consulta. Se você seguir só isto, na ordem, já ganha a maior parte
do valor:

**Antes de começar (≈4h)**
1. 🆓 The Twelve-Factor App — leia inteiro, são 12 páginas curtas
2. 🆓 linuxatemyram.com — 2 minutos, evita pânico desnecessário com memória
3. 🆓 TechWorld with Nana, "Docker Tutorial for Beginners" — o modelo mental de container

**Durante as fases 0–2 (≈3h)**
4. 🆓 Docker docs, "Packet filtering and firewalls" — o furo do UFW
5. 🆓 DigitalOcean, "Initial Server Setup for Ubuntu"
6. 🆓 Rode `lynis audit system` e leia cada sugestão

**Durante as fases 3–4 (≈3h)**
7. 🆓 Turborepo, "Core Concepts"
8. 🆓 pnpm docs, seção Docker
9. 🆓 Snyk, "10 best practices for Node.js Docker images"

**Durante as fases 5–6 (≈4h)**
10. 🆓 Let's Encrypt, "How It Works" + "Rate Limits"
11. 🆓 Use The Index, Luke! — os três primeiros capítulos
12. 🆓 Redis docs, "Security"

**Durante as fases 7–8 (≈4h)**
13. 🆓 GitHub Actions, "Security hardening"
14. 🆓 Google SRE Book, capítulo 6
15. 🆓 "My Philosophy on Alerting"

**Depois, para consolidar (meses)**
16. 💰 Docker Deep Dive — leitura completa
17. 💰 Designing Data-Intensive Applications — um capítulo por semana
18. 🆓 OWASP Top 10 — com os exemplos de código

Total das partes gratuitas: cerca de **18 horas** de leitura dirigida, distribuídas ao
longo das fases. É pouco para o que você ganha em autonomia.

---

## Comunidades

- 🆓 **r/selfhosted** (Reddit) — cenários idênticos ao seu; boa fonte de soluções reais
- 🆓 **r/docker**, **r/PostgreSQL** — perguntas específicas
- 🆓 **Traefik Community Forum** — o mantenedor responde
- 🆓 **Stack Overflow** — para erros específicos, com a mensagem exata entre aspas
- 🆓 **awesome-selfhosted** (GitHub) — catálogo de alternativas self-hosted a serviços
  pagos, útil quando você quiser adicionar algo à stack
