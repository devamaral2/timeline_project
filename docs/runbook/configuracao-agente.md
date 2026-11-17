---
status: draft
date: 2026-11-08
---

> **Substituído pela [ADR 0005](../adr/0005-skills-e-agentes-do-hermes-como-arquivos.md).** Este documento descreve a configuração do agente guardada no banco, que foi removida junto com o chat legado.

# Runbook: Configuração editável do agente

## Quando usar
- Uma publicação de configuração piorou o comportamento de um agente (roteamento, entidade ou consulta).
- Aparece uma pendência de sincronização com o Hermes por mais de alguns minutos.
- O Hermes mostra uma alteração feita por ele que você não reconhece.

## Pré-requisitos
- Acesso de dono à aplicação.
- Para o Hermes: acesso ao container, como descrito no [runbook do Hermes](hermes.md) (`pnpm hermes:up` em local; `kubectl -n braid exec -it deploy/hermes` em produção).

## Verificar a saúde
- Pendências de sincronização: a lista deve estar vazia ou com itens com próxima tentativa agendada em até 5 minutos.
- Versão ativa: a mesma que aparece como última publicada, sem pendência de sincronização.
- Hermes: o endpoint de saúde responde (ver o runbook do Hermes).

## Procedimento

### Reverter uma publicação ruim
1. Abra o histórico da configuração na aplicação. Resultado esperado: lista de instantâneos com data e origem.
2. Escolha o instantâneo anterior ao problema e publique a reversão. Resultado esperado: a versão ativa passa a ser o instantâneo escolhido, e um novo instantâneo de reversão aparece no topo do histórico.
3. Envie um pedido de teste para o agente afetado. Resultado esperado: o comportamento volta ao anterior.
4. Confira se a reversão sincronizou com o Hermes. Resultado esperado: sem pendência, ou pendência visível e sendo repetida.

### Resolver uma pendência de sincronização
1. Veja se o Hermes está no ar (runbook do Hermes). Se estiver, a pendência deve sumir sozinha no próximo ciclo de 5 minutos.
2. Se o Hermes estiver fora do ar, aguarde a atualização diária ou a recuperação do container. A pendência é repetida até sincronizar; não é preciso republicar.
3. Se a pendência não sumir com o Hermes no ar, anote o último erro mostrado na lista e escale (ver abaixo).

### Conferir uma alteração feita pelo Hermes
1. Abra o histórico e filtre por origem Hermes. Resultado esperado: o instantâneo que registrou a alteração.
2. Compare com o instantâneo anterior. Se a alteração for indesejada, publique uma reversão ao instantâneo anterior e sincronize.

## Reverter
- A reversão é a própria forma de desfazer uma publicação. Ela não apaga instantâneos, então pode ser desfeita por outra reversão.
- Para voltar ao original, use o padrão de fábrica: publique a configuração do repositório como nova versão.
- Não há prazo de segurança para reverter, porque o histórico não tem limite.

## Escalar
- Pendência de sincronização que não se resolve com o Hermes no ar: responsável pelo Hermes (o próprio dono, em local).
- Publicação que quebra pedidos reais e não se corrige por reversão: responsável pelo agente (o dono, em local).

## Pendências
- Caminho exato das skills no volume `/opt/data` do Hermes e comando de recarga da versão instalada. Ainda não verificado no container.
- Como a aplicação acessa o volume do Hermes em produção (ver TDD).
- Nome exato das telas e rotas de histórico e pendências, que dependem da implementação.
- Limiar de tempo para escalar uma pendência: não foi decidido na entrevista.
