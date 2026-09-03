# Fase 8 — Tracing e observabilidade de LLM

## 1. Objetivo

Um trace único atravessando Next, Nest, LiteLLM, provider e PostgreSQL; dashboards de
custo, tokens e latência por lane; SLOs com alerta por burn rate; e redação de dado
sensível antes da indexação.

## 2. Por que isso existe

O v1 tinha métricas e logs. Isso responde *quantas requisições falharam* e *o que a
aplicação escreveu*. O que ele nunca conseguiria responder é a pergunta que mais aparece
neste sistema: **por que esta requisição específica demorou nove segundos?**

O caminho de uma criação de evento por voz tem nove saltos, listados em
[`01-arquitetura-e-orcamento.md`](01-arquitetura-e-orcamento.md). Três deles podem ser
lentos por motivos completamente diferentes: o modelo pensando, a skill escrevendo no
banco, ou a rede até o provider. Uma métrica agregada dá a soma. Um trace dá a divisão —
e a divisão é o diagnóstico.

É por isso que trazer a observabilidade para casa (Fase 2) valeu a pena: tracing era a
peça que faltava, e é a que muda como você depura.

A segunda metade da fase é o que o LiteLLM da Fase 7 tornou possível: **custo como sinal
de primeira classe**. Quanto custou o parsing de comida este mês, por lane, com qual taxa
de acerto de cache. Antes isso morava no painel de um fornecedor; agora mora no mesmo
Grafana que o resto, ao lado da métrica de memória — o que permite responder perguntas que
cruzam os dois, como "o pico de custo de terça foi o mesmo pico de tráfego?".

## 3. Passo a passo

### 3.1 — Instrumentar a API

`@opentelemetry/auto-instrumentations-node` cobre HTTP, o driver do Postgres e o Redis sem
alterar código de negócio. O que ele precisa é ser carregado **antes** do Nest, num
arquivo próprio importado no topo do `main.ts`.

```ts
// apps/api/src/tracing.ts — esboco
// OTEL_EXPORTER_OTLP_ENDPOINT aponta para alloy.observability.svc.cluster.local:4318
// OTEL_SERVICE_NAME = "api"
// Amostragem: parentbased_traceidratio, ver 3.3
```

Dois spans manuais valem o esforço, porque são os que a instrumentação automática não sabe
nomear bem:

- um em volta da chamada ao LiteLLM, com atributos de lane, modelo e tokens;
- um em volta da execução de cada skill do agente, que é onde a escrita no banco acontece.

⚠️ Atributo de span **não** é lugar para prompt nem para transcrição. Vale o mesmo
princípio da Fase 7: metadado sim, conteúdo não.

### 3.2 — O web propaga o contexto

Sem isso, o trace começa no Nest e você perde o salto do Next — que é justamente onde mora
a diferença entre "o backend está lento" e "o SSR está lento". O `fetchFromBackend` em
`apps/web/src/lib/api/backend.ts` precisa repassar o cabeçalho `traceparent`.

Isso é propagação de contexto, não regra de negócio, então não fere a direção de
dependências do `AGENTS.md`.

### 3.3 — Amostragem, desde o começo

100% dos traces em produção enche disco e não ensina nada de novo. A configuração inicial:

| Tipo de requisição | Amostragem | Motivo |
|---|---|---|
| Rotas de IA | 100% | são poucas, caras e as mais interessantes |
| Timeline e leitura | 10% | volume alto, comportamento uniforme |
| Erros (5xx) | 100% | quando dá errado, você quer o trace inteiro |
| Health e ready | 0% | ruído puro |

Retenção de 3 dias, como definido na Fase 2. Trace serve para o incidente de agora; o que
precisa durar meses vira métrica.

### 3.4 — Métricas de LLM

Conforme a verificação 3.2c da Fase 7, a fonte é o `/metrics` do LiteLLM ou as tabelas de
spend na database `litellm` por `postgres-exporter`. O dashboard é o mesmo nos dois casos:

| Painel | Pergunta que responde |
|---|---|
| Custo por lane por dia | onde o dinheiro está indo |
| Custo acumulado no mês contra `max_budget` | quanto falta para a aplicação parar |
| Tokens de entrada e saída por lane | se um prompt cresceu sem ninguém notar |
| Latência p50/p95 por lane e por modelo | se o Hermes é mesmo mais rápido |
| Taxa de acerto do cache | se o cache está pagando o Redis que ocupa |
| Taxa de fallback por lane | se o primário está degradando em silêncio |

A taxa de fallback é a mais subestimada: se o Hermes começar a falhar 30% das vezes, tudo
continua funcionando — e você só descobre pela conta no fim do mês, porque o fallback é
mais caro.

### 3.5 — SLOs em vez de só limiares

O v1 alertava por limiar: disco acima de 80%, container acima de 80% do limite. Isso
continua e é útil para recursos. Para experiência do usuário, limiar é ruim — "latência
acima de 500ms" dispara em qualquer pico de dez segundos e ensina você a ignorar alerta.

SLOs iniciais, a calibrar com o baseline da Fase 0:

| SLO | Objetivo | Janela |
|---|---|---|
| Disponibilidade da timeline | 99,5% de requisições sem 5xx | 30 dias |
| Latência da timeline | 99% abaixo de 500ms | 30 dias |
| Disponibilidade das rotas de IA | 99% sem 5xx | 30 dias |

Alerta por **burn rate multi-janela**: dispara quando o orçamento de erro está sendo
consumido rápido o bastante para acabar antes do fim do período. Uma janela curta pega
incidente agudo; uma longa pega degradação lenta. É a diferença entre ser acordado por um
problema real e ser acordado por um pico.

A latência das rotas de IA fica fora do SLO de propósito: ela depende do provider, e um SLO
sobre algo que você não controla vira ruído. Meça, mostre no dashboard, mas não alerte.

### 3.6 — Redação, a segunda linha

A Fase 7 já configurou o LiteLLM para não gravar corpo de prompt. Este estágio existe para
o que escapar — um `console.log` de depuração esquecido, um erro que traz a entrada junto.

No pipeline do Alloy, antes de escrever no VictoriaLogs: descarte ou mascare campos com
prompt, transcrição, texto de entrada do usuário, cabeçalho de autorização e token.

Teste isso de propósito: gere um evento por voz com uma frase reconhecível e procure por
ela nos logs. Se achar, o estágio não está funcionando — e é melhor descobrir com uma
frase de teste.

## 4. Por que não fazer diferente

**Ficar só com métricas e logs.** Era o desenho do v1 e funcionava para o que ele cobria.
Descartado porque a aplicação mudou de forma: quando o caminho crítico tem nove saltos e
três fornecedores externos, log dá o quê e métrica dá o quanto, mas nenhum dos dois dá o
onde.

**Langfuse ou outra ferramenta específica de LLM.** Melhor experiência para comparar
versões de prompt e avaliar saída. Descartado pelo peso, como na Fase 7. Se avaliação
sistemática de prompt virar objetivo, ela entra — e aí o OTel continua útil, porque as duas
coisas respondem perguntas diferentes.

**Instrumentação manual em vez de automática.** Dá spans mais limpos e menos ruído.
Descartado como ponto de partida: a instrumentação automática cobre HTTP, Postgres e Redis
sem tocar em regra de negócio, e os dois spans manuais de 3.1 cobrem o que falta. Refinar
depois, com dado real sobre o que é ruído.

**Amostragem em 100%.** Tentador no começo, quando o volume é baixo. Descartado porque a
amostragem é mais difícil de introduzir depois, quando já existe hábito de olhar todo
trace — e porque o disco da Fase 2 tem conta fechada.

**Alertar na latência das rotas de IA.** Descrito em 3.5. Um alerta sobre o tempo de
resposta de um fornecedor é um alerta que você vai silenciar.

## 5. Como garantir que está certo

O teste principal: crie um evento por voz pelo app e abra o trace no Grafana.

Esperado: um trace único, com spans aninhados cobrindo Next → Nest → LiteLLM → provider →
PostgreSQL. Se aparecerem dois traces desconectados, a propagação do passo 3.2 não está
funcionando — que é o erro mais comum desta fase.

```bash
# ☸️ cluster
kubectl -n observability logs deploy/alloy --tail 50 | grep -i otlp
```

Esperado: recebimento de spans, sem erro de exportação para o Tempo.

Para os dashboards de custo, gere tráfego real e confirme que os seis painéis de 3.4
mostram dado. O painel de acerto de cache deve subir se você repetir a mesma refeição — se
não subir, o cache da Fase 7 não está sendo consultado.

O teste de redação, descrito em 3.6: procure a frase de teste nos logs e **não** ache.

O teste dos SLOs: force erros — pare o LiteLLM por dois minutos — e confirme que o burn
rate sobe e o alerta dispara. Depois restaure e confirme que ele se resolve sozinho. Um
alerta que nunca disparou é um alerta que você não sabe se funciona.

E a conferência de cardinalidade, que protege a Fase 2:

```bash
# ☸️ cluster
kubectl -n observability exec deploy/victoriametrics -- \
  wget -qO- "http://127.0.0.1:8428/api/v1/status/tsdb" | head -40
```

Esperado: nenhuma label de alta cardinalidade no topo. Se `pod` ou algo com ID aparecer
entre as maiores, a regra de rotulagem de 3.4 da Fase 2 foi violada em algum lugar.

## 6. Armadilhas comuns

**Traces desconectados entre web e API.** Descrito acima. O sintoma é dois traces com o
mesmo instante e nenhuma relação.

**A instrumentação carregada tarde demais.** Se o `tracing.ts` for importado depois do
Nest, boa parte das bibliotecas já foi carregada e não é mais instrumentável. O sintoma é
um trace com só o span de HTTP e nada de banco — parece que o banco está rápido.

**Prompt vazando em atributo de span.** Traces também são armazenamento. A regra da 3.1
vale tanto quanto a de log.

**Disco de traces enchendo.** 3 dias de retenção e 10 GiB parecem muito até o dia em que
alguém sobe a amostragem para 100% "só para investigar" e esquece.

**Alerta de burn rate calibrado com baseline errado.** Se o SLO for definido com um número
que a aplicação nunca cumpriu, o alerta nasce disparando. Use os números da Fase 0.

**Achar que trace substitui log.** Ele mostra onde o tempo foi. O que aconteceu continua
no log, e o quanto continua na métrica. Os três respondem perguntas diferentes.

## 7. Para estudar

- 🆓 [OpenTelemetry — Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- 🆓 [OpenTelemetry — Semantic Conventions for GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — nomes padronizados para atributos de modelo, tokens e custo. Use estes, não invente os seus.
- 🆓 [Grafana Tempo — TraceQL](https://grafana.com/docs/tempo/latest/traceql/)
- 🆓 [Google SRE Workbook, cap. 5 — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) — a referência de burn rate multi-janela.
- 🆓 [W3C — Trace Context](https://www.w3.org/TR/trace-context/) — o cabeçalho `traceparent` do passo 3.2.
