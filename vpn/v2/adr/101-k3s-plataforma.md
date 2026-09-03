# ADR-101 — k3s como plataforma

**Status:** aceita · **Data:** 2026-08-31
**Supersede:** [ADR-001 — Docker Compose em vez de Kubernetes](../../docs/adr/001-docker-compose-vs-k3s.md)

## Contexto

A ADR-001 escolheu Docker Compose para um VPS de 4 GiB, com um argumento correto: o
control plane do k3s consome 600–800 MiB, que era 20% da máquina antes de qualquer
aplicação. Ela listou explicitamente os gatilhos de revisão: passar de três servidores,
requisito de indisponibilidade zero no deploy, autoscaling real, ou exigência externa.

Dois deles se aproximaram, e um fato novo apareceu. O servidor passou a ter **16 GiB** — o
mesmo control plane agora custa 4%. E a lista de "consequências negativas" que a ADR-001
aceitou deixou de ser aceitável na mesma medida: sem rolling update, sem secrets nativos,
sem gestão de recursos sofisticada.

Há também um objetivo declarado de estudo. A ADR-001 encerrava com "guarde o repositório
`k8`. Ele não está errado; está adiantado". Deixou de estar.

## Decisão

Usar **k3s de um nó** como plataforma. Migrar todos os workloads e aposentar o Docker
Compose ao fim da migração.

## Alternativas consideradas

**Manter o Compose.** Continua funcionando, é mais simples e tem material abundante. É a
escolha certa se o objetivo for exclusivamente manter o site no ar com o menor esforço
possível. Descartada porque quatro problemas concretos ficam sem solução limpa: janela de
deploy, migration que precisa passar antes do rollout, piso de memória para o banco, e
segredo versionado.

**Compose para produção, k3s só para estudo.** O caminho de menor risco, e foi considerado
seriamente. Descartado por criar duas plataformas permanentes: dois lugares para atualizar,
dois lugares onde um serviço pode estar, e um cluster de estudo que nunca ganha a
seriedade de produção — e portanto não ensina a parte que interessa.

**Docker Swarm.** Traz secrets nativos e rolling updates, o que cobre duas das quatro
lacunas. Descartado pelo mesmo motivo da ADR-001: manutenção mínima há anos.

**Kubernetes completo (kubeadm).** Mais fiel ao que empresas operam. Custa mais RAM e
muito mais manutenção para o mesmo resultado funcional num nó.

## Consequências

**Positivas.** Rolling update sem janela. Migrations como Job com dependência real.
`requests` e QoS `Guaranteed` protegendo Postgres e Redis do despejo. NetworkPolicy no
lugar de topologia de rede. `OOMKilled` observável por container. Rollback declarativo com
histórico. CronJob para backup. Namespace habilitando staging sem segundo servidor. E o
GitOps da ADR-104, que só existe porque há um controlador dentro do cluster.

**Negativas.** ~600 MiB de plataforma. Uma camada a mais entre você e o processo, que
custa caro num dia ruim de debug. `local-path` prende o volume ao nó. E, o mais importante
de não esquecer: **um nó continua sendo um ponto único de falha** — Kubernetes não inventa
hardware, e o self-healing dele não tem para onde reagendar.

**Mitigações.** O backup lógico com restore testado continua sendo a rede de segurança
real, não o cluster. A migração é faseada, com o Compose de pé como caminho de volta até a
Fase 11.

## Quando revisitar

- Se o custo de operação da plataforma passar a competir com o de escrever a aplicação.
- Ao passar de um nó, quando várias decisões desta spec mudam de resposta ao mesmo tempo.
- Se um requisito de HA aparecer — aí a decisão não é sobre orquestrador, é sobre servidor.
