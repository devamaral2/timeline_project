# ADR-102 — Traefik instalado por Helm, não o embutido do k3s

**Status:** aceita · **Data:** 2026-08-31

## Contexto

O k3s instala um Traefik por padrão, gerenciado por um recurso próprio do k3s que ele
reconcilia sozinho. Isso funciona bem para um cluster de uso geral.

A [ADR-104](104-flux-gitops.md) coloca o Flux como o dono do estado desejado do cluster.
Duas coisas reconciliando o mesmo objeto é a definição de drift.

## Decisão

Instalar o k3s com `--disable=traefik` e entregar o Traefik como HelmRelease pelo Flux.
Também `--disable=servicelb`, já que o Traefik usa `hostPort` direto num nó só.

## Alternativas consideradas

**Manter o Traefik embutido.** Um passo a menos na instalação e uma peça a menos para
manter. Seria a escolha certa se não houvesse GitOps — sem Flux, não há segundo dono.

**Manter o embutido e customizar pelo mecanismo do próprio k3s.** Suportado e documentado.
Descartado porque a configuração ficaria num formato específico do k3s, fora do fluxo em
que todo o resto vive, e a migração para outro Kubernetes exigiria reescrevê-la.

**ingress-nginx.** O Ingress Controller mais usado, com o maior volume de material. Seria
a escolha certa se empregabilidade nesta peça específica fosse o objetivo. Descartado para
não trocar de proxy junto com a troca de orquestrador, e porque configuração por anotação
é menos legível que os CRDs do Traefik.

## Consequências

**Positivas.** Um dono só para cada objeto. A versão do Traefik e seus valores ficam no
git, revisáveis em PR. A configuração é portável para qualquer Kubernetes.

**Negativas.** Dois passos a mais na instalação, e a responsabilidade de acompanhar
atualizações do chart — que o k3s faria por você.

## Quando revisitar

- Se o GitOps sair do desenho, o embutido volta a ser a escolha melhor.
- Se o Traefik deixar de atender e a troca de Ingress Controller virar pauta.
