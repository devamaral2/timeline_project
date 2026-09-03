# ADR-001 — Docker Compose em vez de Kubernetes

**Status:** substituída pela [ADR-101](../../v2/adr/101-k3s-plataforma.md) · **Data:** 2026-08-25

## Contexto

Um VPS único de 4GB precisa orquestrar ~10 containers: proxy, aplicação, Postgres, Redis
e a stack de observabilidade. Já existe uma implementação prévia em k3s
(`OneDrive/Documentos/k8`) que funciona conceitualmente, mas nunca foi levada a produção.

Objetivos declarados: colocar aplicações no ar, aprender cada peça, e caber em 4GB com
folga para crescer.

## Decisão

Usar **Docker Compose** como orquestrador. Remover o k3s do servidor.

## Alternativas consideradas

**k3s (Kubernetes leve).** Consome 600–800MB só de control plane — API server,
scheduler, controller-manager, etcd embutido, kubelet. Isso é 20% da RAM total antes de
qualquer aplicação subir. Em troca, oferece self-healing, rolling updates, autoscaling e
service discovery — recursos que resolvem problemas de **múltiplos nós**. Com um servidor
só, não há para onde reagendar um pod quando o nó cai; o self-healing do Kubernetes vira
o `restart: unless-stopped` do Docker com mais passos. A curva de aprendizado também
compete com o objetivo: cada problema exige entender uma abstração a mais.

**Docker Swarm.** Vem embutido no Docker, traz secrets nativos (vantagem real sobre
Compose) e rolling updates. Descartado porque está em manutenção mínima há anos: a
comunidade migrou, o material é antigo, e responder dúvidas ficaria difícil.

**Nomad (HashiCorp).** Mais simples que Kubernetes, um binário só, roda containers e
processos comuns. Ecossistema pequeno demais; você seria a única pessoa do seu círculo
usando.

**Sem orquestrador — `systemd` + `docker run`.** Funciona e é o mais leve. Perde-se a
declaratividade: a configuração vira scripts imperativos difíceis de versionar e revisar.

## Consequências

**Positivas.** ~700MB liberados. Configuração declarativa e versionável em YAML.
Modelo mental simples: um arquivo, um `up -d`. Sem componentes de control plane para
manter atualizados. É o que a maioria dos projetos self-hosted usa, então há material
abundante.

**Negativas.** Sem rolling updates de verdade — há uma janela de indisponibilidade de
alguns segundos no deploy. Sem secrets nativos (usamos `.env` com `chmod 600`). Não
escala para múltiplos servidores. Sem gestão de recursos sofisticada (requests vs limits,
prioridades de eviction).

**Mitigações.** O healthcheck do Docker mais o `restart: unless-stopped` cobrem o
self-healing de nó único. Para a janela de deploy, `docker compose up -d` recria só o que
mudou, e o Traefik para de rotear para containers unhealthy.

## Quando revisitar

- Ao passar de **3 servidores** — aí o Kubernetes começa a pagar seu custo
- Se o requisito de indisponibilidade zero no deploy aparecer
- Se você precisar de autoscaling real por carga
- Se um empregador/cliente exigir Kubernetes — nesse caso o repositório `k8` já é o
  ponto de partida

Guarde o repositório `k8`. Ele não está errado; está adiantado.
