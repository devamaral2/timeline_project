# ADR-107 — Hermes como lane remota, sem inferência local

**Status:** aceita · **Data:** 2026-08-31

## Contexto

Com o [LiteLLM](106-litellm-gateway.md) no lugar, incluir um modelo Hermes da Nous Research
no desenho passou a ser uma questão de configuração. A pergunta era **onde** ele roda.

O servidor tem 16 GiB de RAM e **nenhuma GPU**.

## Decisão

Usar o Hermes como **modelo remoto**, atendendo as lanes `event-parsing` e `food-parsing`,
com fallback para o modelo atual. Nenhuma inferência local: sem Ollama, sem vLLM, sem peso
de modelo no servidor.

A lane `event-agent` fica no modelo que já funciona, e **sem fallback**.

## Alternativas consideradas

**Rodar o Hermes localmente com Ollama ou vLLM.** Foi a leitura inicial e foi descartada
por decisão explícita. Os números: um modelo de 8B quantizado em 4 bits ocupa 5–6 GiB de
RAM e entrega poucos tokens por segundo num vCPU compartilhado. Para uma rota com usuário
esperando — voz, criação de evento — isso é inutilizável, e come um terço do servidor.
Seria a escolha certa com GPU, ou para trabalho em lote sem ninguém esperando.

**Um modelo pequeno local só para parsing.** Modelos de 3B a 4B rodam mais rápido e a
tarefa é extração estruturada com schema, que é o caso mais favorável. Ainda assim: RAM
permanentemente ocupada, qualidade menor num ponto onde erro de parsing vira dado errado no
banco, e latência pior que a rede até um provider. Revisitar só com GPU.

**Hermes também na lane do agente.** Modelos Hermes têm boa reputação em tool calling.
Descartado por precaução: o agente executa skills que **escrevem** no banco, e o modelo
atual já está validado nesse caminho. Trocar o modelo do agente é uma mudança para fazer
com staging e comparação, não junto com a introdução do proxy.

**Fallback na lane do agente.** Descartado de propósito: cair para outro modelo no meio de
uma execução com ferramentas pode duplicar um evento criado. Falhar alto é o comportamento
certo ali.

## Consequências

**Positivas.** Custo menor nas duas lanes de maior volume. Zero RAM adicional. Fallback
automático mantém a funcionalidade quando o Hermes falha. Trocar o modelo de uma lane
continua sendo configuração.

**Negativas.** Mais um fornecedor externo, com mais uma chave para guardar e rotacionar.
Se o Hermes degradar em silêncio, o fallback esconde o problema e a conta sobe — daí o
painel de taxa de fallback ser obrigatório na Fase 8.

**A validar na execução:** o slug atual no catálogo escolhido, e o suporte a `json_schema`
com `strict: true`, do qual os dois gateways de parsing dependem. Se não houver, o plano B
é `json_object` com validação Zod — barato, porque o schema já está escrito.

## Quando revisitar

- Se houver GPU no servidor, inferência local volta à mesa.
- Se a qualidade do parsing cair de forma mensurável, a lane volta ao modelo anterior por
  configuração.
- Se o Hermes se mostrar confiável em tool calling no staging, avaliar a lane do agente.
