---
status: superseded by 0005
date: 2026-11-08
---

# Banco como fonte da configuração do agente, com o repositório como padrão de fábrica

## Contexto

Os textos e parâmetros dos agentes (roteamento, criação, edição e consulta de entidades, e as skills) ficam em JSON e Markdown dentro de `apps/api/src/api-core/agent/config/` e `apps/api/src/api-core/process/`. São validados e lidos uma vez, na subida do processo. Para mudar um texto hoje é preciso editar o arquivo, abrir PR e fazer deploy.

O dono quer editar esses textos pela própria aplicação, com efeito imediato.

## Decisão

- A fonte da verdade da configuração do agente passa a ser o **banco**, com versões.
- Os arquivos do repositório viram o **padrão de fábrica**: ponto de partida para a primeira carga e destino de volta quando o dono quiser o original.
- Os textos são editados agente por agente, e os parâmetros editáveis são limites e tempos (ver [CONTEXT.md](../../CONTEXT.md)). O modelo de cada rota continua fora da edição.

## Consequências

- A validação hoje feita na carga passa a acontecer na publicação (ver ADR 0002).
- Mudanças de texto deixam de passar por revisão de código; o histórico e a reversão tomam o lugar do PR.
- Os arquivos do repositório precisam continuar válidos, porque são o padrão de fábrica.
