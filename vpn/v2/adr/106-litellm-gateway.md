# ADR-106 — LiteLLM como gateway único de modelos

**Status:** aceita · **Data:** 2026-08-31

## Contexto

Três gateways em `apps/api` falam com o OpenRouter, dois deles com a URL escrita no
código. Isso funciona, e não dá quatro coisas:

1. trocar de modelo ou cair para um segundo exige deploy;
2. o teto de custo existente (`MAX_COST_USD`) limita uma requisição, não mil;
3. não há custo por rota visível fora do painel do fornecedor;
4. prompt repetido — parsing de comida repete muito — custa de novo.

A [Fase 10](../12-fase-10-api-publica.md) publica a API para o mobile, o que torna o
item 2 uma conta em aberto.

## Decisão

Um **LiteLLM** no namespace `prod` como único caminho da aplicação até qualquer modelo.
Database própria no PostgreSQL existente, cache na database 1 do Redis existente, chave
virtual com orçamento para a API, e **lanes nomeadas por tarefa** — `event-agent`,
`event-parsing`, `food-parsing` — em vez de nomes de fornecedor.

A aplicação passa a ler `LLM_BASE_URL` e `LLM_API_KEY`, com fallback para o comportamento
atual.

## Alternativas consideradas

**Continuar chamando o OpenRouter direto.** Ele já é agregador, já roteia entre
fornecedores e já tem painel de custo. Seria suficiente se o objetivo fosse só trocar de
modelo. Descartado pelo que ele não dá: orçamento que você controla, cache no seu Redis,
métrica no seu Grafana, e um ponto único onde a política de privacidade do prompt se
aplica.

**Uma camada própria atrás dos portos existentes.** Os portos já existem; fallback e cache
caberiam ali. Descartado por reescrever pior o que existe pronto, e porque orçamento
dentro do processo da API se perde quando o pod reinicia.

**Portkey, Helicone e afins.** Equivalentes hospedados. Descartados pelo mesmo motivo que
a observabilidade voltou para casa.

**Langfuse.** Resolve rastreio no nível de prompt, não roteamento. Descartado por peso —
as versões atuais querem ClickHouse — e por resolver outro problema.

## Consequências

**Positivas.** Modelo vira configuração. Orçamento e limite por minuto do lado do servidor.
Cache reduz custo e latência nas repetições. Custo, tokens e latência por lane no Grafana.
Um lugar só para decidir o que é gravado de um prompt.

**Negativas.** Mais um serviço, com database e cache próprios. Um salto a mais na latência.
Uma dependência a mais no caminho crítico das rotas de IA — se o proxy cair, toda a IA cai.
E o cache pressiona um Redis com política `noeviction`, o que exige TTL obrigatório.

**Verificações que a implementação precisa fazer, não presumir:** se o SDK do agente
aceita `baseURL`; se o Hermes suporta `json_schema` estrito; se o `/metrics` do LiteLLM
está na versão OSS escolhida.

## Quando revisitar

- Se o proxy se mostrar frágil no caminho crítico, avaliar chamar o provider direto com o
  LiteLLM só como fallback.
- Se avaliação sistemática de prompt virar objetivo, o Langfuse entra ao lado, não no
  lugar.
- Se quota por usuário final entrar em escopo, as chaves virtuais são o mecanismo.
