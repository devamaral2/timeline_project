---
status: accepted
date: 2026-11-08
---

# Edição da configuração restrita ao dono

## Contexto

A [ADR 004](../../.agents/docs/ai-dialog/adr-004-hermes-automacoes.md) limita a aplicação a um único usuário, o dono, por enquanto. Visitantes (papel `viewer`) apenas visualizam e não usam o chat. Editar a configuração muda o comportamento de todos os pedidos e do Hermes, então é uma ação de alto impacto.

## Decisão

- Só o **dono** pode editar, publicar, reverter ou sincronizar a configuração do agente.
- Nenhum papel de editor é criado agora.

## Consequências

- Não há checagem de permissão nova para o papel de editor, porque ele não existe.
- Quando a aplicação tiver mais de um usuário, esta decisão precisa ser revisitada junto com a checagem de papéis que a ADR 004 já marca como pendente.
