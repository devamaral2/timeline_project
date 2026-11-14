---
status: accepted
date: 2026-11-10
---

# Braid e Hermes ficam como nomes internos

## Contexto

`braid` não é só a marca antiga: é o identificador do app Android (`app.braid.mobile`), o namespace do Kubernetes, o
nome das imagens, o prefixo das sessões do agente e o alias das worktrees, e aparece em mais de 300 arquivos. `hermes`
é o nome do agente de terceiros que executa os pedidos e também dá nome a componentes, rotas e documentos.

## Decisão

A troca para Candeia ([ADR 0007](./0007-produto-e-agente-se-chamam-candeia.md)) alcança só o que o usuário vê: nome,
assinatura, ícone, textos da interface e título das APIs. Os identificadores técnicos não mudam. `braid` segue como
codinome interno do produto e `hermes` como nome técnico do agente que roda por baixo.

O motivo é o custo sem retorno: trocar o identificador do app faria o Android tratá-lo como outro app, e a migração
dos demais identificadores é grande e não muda nada para quem usa.

## Consequências

- Quem ler o código verá `braid` e `hermes` onde a tela diz Candeia. É deliberado; não é uma troca pela metade.
- Nenhum texto visível ao usuário pode dizer Braid ou Hermes. O limite é a tela, não o arquivo.
- A troca dos identificadores pode ser feita depois, como trabalho próprio, se um dia incomodar.
