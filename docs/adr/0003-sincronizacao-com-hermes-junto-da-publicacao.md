---
status: accepted
date: 2026-11-08
---

# Sincronização com o Hermes junto da publicação, com leitura do volume e pendência

## Contexto

O Hermes guarda suas skills e agentes no volume `/opt/data` (ver [ADR 004](../../.agents/docs/ai-dialog/adr-004-hermes-automacoes.md) e o [runbook do Hermes](../runbook/hermes.md)). A documentação oficial indica `~/.hermes/skills` como fonte de verdade das skills. O Hermes pode também reescrever as próprias skills durante o uso, então uma skill pode mudar sem passar pela aplicação. A atualização diária do Hermes reinicia o container por cerca de um minuto.

## Decisão

- A **sincronização** roda na mesma ação da publicação: grava no volume as skills e agentes publicados.
- Antes de cada escrita, a aplicação **lê o volume** e compara com a versão ativa. Uma **alteração do Hermes** detectada vira um instantâneo com origem Hermes, e a reversão pode voltar a ela. Nada é sobrescrito em silêncio.
- Na importação inicial, **todas** as skills e agentes que já existem no volume entram na edição, e a aplicação passa a ser a fonte deles.
- Se o Hermes estiver fora do ar, a publicação **vale** na aplicação e fica uma **pendência de sincronização**, visível, repetida a cada 5 minutos até sincronizar.
- O texto novo vale nas **sessões do Hermes** que começarem depois da sincronização. Conversas em andamento seguem com o texto antigo.

## Consequências

- A aplicação e o Hermes podem ficar desalinhados durante uma pendência, por tempo limitado e visível.
- Depende do caminho exato das skills no volume e do comando de recarga da versão instalada do Hermes, ainda a verificar (ver o TDD).
- A reversão também passa pela sincronização, e vale a mesma pendência se o Hermes estiver fora.
