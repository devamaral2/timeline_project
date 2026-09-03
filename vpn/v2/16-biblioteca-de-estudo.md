# 16 — Biblioteca de estudo

A [biblioteca do v1](../docs/13-biblioteca-de-estudo.md) continua valendo para Linux,
Docker, pnpm, Turborepo, Node, Nest, Next, TLS, Postgres, Redis e CI/CD. Este documento
cobre só o que o v2 acrescenta.

🆓 gratuito · 💰 pago

---

## Kubernetes — fundamentos

- 🆓 [Kubernetes — Concepts](https://kubernetes.io/docs/concepts/) — a documentação oficial é boa e está subestimada. Leia "Workloads" e "Services, Load Balancing, and Networking" inteiros.
- 🆓 [Managing Resources for Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests, limits e QoS. **O documento mais importante desta lista** para o v2: é a distinção que a Fase 4 usa para proteger o banco.
- 🆓 [Node-pressure Eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) — como o kubelet escolhe a vítima. É o assunto que substitui o OOM killer do v1.
- 🆓 [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) — as três probes e por que são três.
- 💰 *Kubernetes Up & Running*, Burns, Beda, Hightower (O'Reilly) — capítulos 1–5 e 11 cobrem quase tudo que o v2 usa.
- 💰 *Kubernetes Patterns*, Ibryam e Huss (O'Reilly) — mais útil depois da Fase 5 que antes: ele nomeia padrões que você já terá usado sem saber o nome.

## k3s

- 🆓 [k3s — Documentation](https://docs.k3s.io/) — curta o bastante para ler inteira num fim de semana.
- 🆓 [k3s — Server Configuration Reference](https://docs.k3s.io/cli/server) — a referência das flags da Fase 1.
- 🆓 [k3s — Backup and Restore](https://docs.k3s.io/datastore/backup-restore) — a parte de SQLite, que é a que se aplica aqui.

## Ingress, TLS e rede

- 🆓 [Traefik — Kubernetes Ingress e CRDs](https://doc.traefik.io/traefik/providers/kubernetes-ingress/)
- 🆓 [cert-manager — Concepts](https://cert-manager.io/docs/concepts/)
- 🆓 [Let's Encrypt — Rate Limits](https://letsencrypt.org/docs/rate-limits/) — leia antes de emitir, não depois.
- 🆓 [Kubernetes — Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- 🆓 [Cilium — Network Policy Editor](https://editor.networkpolicy.io/) — visualiza a política antes de aplicar. Salva tempo real.

## GitOps e segredos

- 🆓 [Flux — Documentation](https://fluxcd.io/flux/) — comece pelo Get Started e depois Image Update Automation.
- 🆓 [OpenGitOps — os quatro princípios](https://opengitops.dev/) — cinco minutos de leitura que organizam o assunto todo.
- 🆓 [SOPS](https://github.com/getsops/sops) e [age](https://github.com/FiloSottile/age)
- 🆓 [Kustomize — bases e overlays](https://kubectl.docs.kubernetes.io/guides/config_management/introduction/)
- 💰 *GitOps and Kubernetes*, Yuen, Matyushentsev et al. (Manning) — usa Argo CD nos exemplos, mas os conceitos transferem.

## Observabilidade

- 🆓 [Grafana Alloy — referência de componentes](https://grafana.com/docs/alloy/latest/reference/components/)
- 🆓 [VictoriaMetrics — Single-server](https://docs.victoriametrics.com/single-server-victoriametrics/) e [VictoriaLogs — LogsQL](https://docs.victoriametrics.com/victorialogs/logsql/)
- 🆓 [OpenTelemetry — Node.js](https://opentelemetry.io/docs/languages/js/) — a instrumentação da Fase 8.
- 🆓 [OpenTelemetry — Semantic Conventions for GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — use estes nomes de atributo, não invente os seus.
- 🆓 [W3C Trace Context](https://www.w3.org/TR/trace-context/) — curto, e explica por que a propagação da Fase 8 é um cabeçalho só.
- 🆓 [Google SRE Book](https://sre.google/sre-book/table-of-contents/) — capítulos 4 (SLOs) e 6 (Monitoring). E o [SRE Workbook, cap. 5](https://sre.google/workbook/alerting-on-slos/) para burn rate.
- 💰 *Observability Engineering*, Majors, Fong-Jones, Miranda (O'Reilly) — a defesa do tracing como sinal primário. Vale mais depois da Fase 8, quando você tiver traces para olhar.

## LLM em produção

- 🆓 [LiteLLM — Documentation](https://docs.litellm.ai/) — Proxy Server, Virtual Keys, Routing e Caching são as quatro seções que a Fase 7 usa.
- 🆓 [OpenAI — Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — o formato `json_schema` que os gateways de parsing já usam.
- 🆓 [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — LLM01 (prompt injection) e LLM10 (consumo irrestrito) são os que tocam este sistema.
- 🆓 Documentação da Nous Research — confirme na execução o slug do Hermes, os limites e o suporte a schema estrito.
- 🆓 [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — sobre quando um agente com ferramentas é a escolha certa e quando um fluxo fixo resolve. Relevante para o agente de skills que já existe.

## Segurança

- 🆓 [Kubernetes — Security Checklist](https://kubernetes.io/docs/concepts/security/security-checklist/) — o equivalente oficial do documento 14.
- 🆓 [Kubernetes — Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- 🆓 [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — base da Fase 10.
- 🆓 [NSA/CISA — Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF) — mais denso que o necessário aqui, e uma boa referência para consultar por tópico.

---

## Trilha sugerida

O v1 sugeria ler as seções 1, 2 e 4 de cada fase antes de executar. Isso continua. O que o
v2 acrescenta é uma ordem de leitura de fundo, porque Kubernetes tem uma dependência
conceitual que Docker não tinha:

**Antes da Fase 1** — "Managing Resources for Containers" e "Node-pressure Eviction".
São 40 minutos, e sem eles metade das decisões das fases 4 e 5 parece arbitrária.

**Antes da Fase 4** — "Pod Lifecycle", com atenção à parte de probes em banco de dados.

**Antes da Fase 6** — os quatro princípios do OpenGitOps. Cinco minutos.

**Antes da Fase 8** — W3C Trace Context e o capítulo 5 do SRE Workbook.

**Depois de tudo** — *Observability Engineering* e *Kubernetes Patterns*. Os dois rendem
muito mais quando você já tem um sistema seu para comparar com os exemplos.

---

## Como estudar sem só executar

A recomendação do [`00-convencoes.md`](00-convencoes.md) merece repetição aqui, porque é a
diferença entre ter um cluster e saber operar um: **uma vez por fase, quebre alguma coisa
de propósito.**

Um roteiro de exercícios que acompanha as fases:

| Depois da fase | Exercício |
|---|---|
| 1 | `kubectl drain` o nó. Veja o que acontece quando só há um. |
| 2 | Encha um PVC de teste até o disco apertar e observe o alerta. |
| 3 | Aponte um Ingress para um Service que não existe e leia o erro. |
| 4 | `kubectl delete pod postgres-0` e cronometre a volta. Confirme o dado. |
| 5 | Baixe o limite de memória do web até ele ser `OOMKilled`. |
| 6 | Edite um Deployment à mão e cronometre até o Flux reverter. |
| 7 | Ponha uma chave inválida no primário e confirme o fallback. |
| 8 | Pare o LiteLLM por dois minutos e veja o burn rate subir. |
| 9 | Force pressão de memória e confirme que o staging cai primeiro. |

A intuição operacional vem de ver o sistema falhar, não de ver ele funcionar.
