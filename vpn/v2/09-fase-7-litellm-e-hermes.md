# Fase 7 — LiteLLM e Hermes

## 1. Objetivo

Um proxy LiteLLM no namespace `prod` como único caminho da aplicação até qualquer modelo,
com lanes nomeadas por tarefa, o Hermes da Nous atendendo as lanes de parsing, cache no
Redis, orçamento por chave virtual e custo por lane visível.

## 2. Por que isso existe

Hoje a aplicação conhece o fornecedor. Três gateways em `apps/api` falam com o OpenRouter,
dois deles com a URL escrita no código:

| Arquivo | Como chama |
|---|---|
| [`openrouter-food-parsing.gateway.ts:120`](../../apps/api/src/events/gateways/openrouter-food-parsing.gateway.ts) | `fetch` para uma URL fixa, com `response_format` de schema estrito |
| [`openrouter-event-command-parsing.gateway.ts:106`](../../apps/api/src/events/gateways/openrouter-event-command-parsing.gateway.ts) | idem |
| [`openrouter-event-agent.gateway.ts`](../../apps/api/src/events/gateways/openrouter-event-agent.gateway.ts) | SDK `@openrouter/agent`, com tool calling |

Isso funciona e é simples. O que ele não dá:

1. **Trocar de modelo exige deploy.** O nome do modelo vem de variável de ambiente, mas
   testar dois modelos lado a lado, ou cair para um segundo quando o primeiro falha, não
   tem onde acontecer.
2. **Não há teto de conta.** O `MAX_COST_USD = 0.05` do agente limita **uma requisição**.
   Nada limita mil requisições. Numa rota que vai ser publicada para o mobile na Fase 10,
   isso é uma conta em aberto.
3. **Não há visibilidade de custo.** Quanto custou o parsing de comida este mês? Hoje a
   resposta está no painel do fornecedor, não no seu Grafana, e não é separável por rota.
4. **Prompt repetido custa de novo.** Parsing de comida repete muito — a mesma refeição,
   descrita do mesmo jeito, várias vezes por semana.

O LiteLLM resolve os quatro sendo uma única coisa: um endpoint compatível com OpenAI que a
aplicação chama, e atrás do qual mora a configuração de fornecedor, orçamento, cache e
métrica.

O **Hermes** entra aqui como modelo remoto — sem inferência local, sem GPU, sem Ollama no
servidor. Ele é uma boa escolha para as lanes de parsing por serem tarefas de extração
estruturada com schema definido, e por ser mais barato que o modelo do agente. A lane de
agente, que depende de tool calling confiável, fica no modelo que já funciona hoje.

## 3. Passo a passo

### 3.1 — Lanes: nome de tarefa, não de fornecedor

A convenção que faz a diferença entre configuração e acoplamento. A aplicação pede
`event-parsing`; qual modelo atende isso é decisão do `config.yaml`.

| Lane | Quem usa | Primário | Fallback |
|---|---|---|---|
| `event-agent` | o gateway do agente, com tool calling | modelo atual, com tool calling comprovado | — |
| `event-parsing` | comando de evento em linguagem natural | Hermes (Nous) | modelo atual |
| `food-parsing` | descrição de refeição para itens e macros | Hermes (Nous) | modelo atual |

Sem fallback no `event-agent` de propósito: o agente executa skills que **escrevem** no
banco, e cair para outro modelo no meio de uma execução com tools é a receita de um evento
criado duas vezes. Falhar alto é o comportamento certo ali.

### 3.2 — Verificações antes de escrever qualquer YAML

Três coisas que esta fase precisa **confirmar**, não presumir. Faça as três antes de
instalar.

**a) O SDK do agente aceita `baseURL`?**

```bash
# 💻 local
grep -rn "baseURL\|baseUrl" node_modules/@openrouter/agent/dist/*.d.ts
```

Se aceitar, o gateway do agente muda numa linha. Se não, o porto `EventAgentGateway` já
existe e recebe um segundo adapter que fala o formato OpenAI — sem tocar no usecase nem no
controller. O trabalho é maior, mas a arquitetura já previu isso.

**b) O Hermes suporta `json_schema` com `strict: true`?**

Os dois gateways de parsing dependem disso. Suporte a schema estrito varia por modelo e
por provider.

```bash
# 💻 local, contra o LiteLLM ja no ar
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d @teste-schema-estrito.json | jq .choices[0].message.content
```

Se não passar, o plano B é barato: `response_format: {type: "json_object"}` e validação com
Zod no gateway, aproveitando que o schema **já está escrito** nos dois arquivos. Registre
qual dos dois caminhos foi usado.

**c) O `/metrics` do LiteLLM está disponível na versão escolhida?**

Parte das métricas Prometheus do LiteLLM já esteve atrás do tier enterprise.

```bash
# ☸️ cluster
kubectl -n prod exec deploy/litellm -- wget -qO- http://127.0.0.1:4000/metrics | head
```

Se não vier nada, o custo sai das tabelas de spend na database `litellm` por
`postgres-exporter`, ou do callback OTel da Fase 8. Confirme **antes** de desenhar o
dashboard, não depois.

### 3.3 — Configuração do proxy

```yaml
# deploy/base/prod/litellm-config.yaml — trecho
model_list:
  - model_name: event-agent
    litellm_params:
      model: openrouter/MODELO_ATUAL
      api_key: os.environ/OPENROUTER_API_KEY
  - model_name: event-parsing
    litellm_params:
      model: SLUG_DO_HERMES
      api_key: os.environ/HERMES_API_KEY
  - model_name: food-parsing
    litellm_params:
      model: SLUG_DO_HERMES
      api_key: os.environ/HERMES_API_KEY

router_settings:
  fallbacks:
    - event-parsing: [openrouter/MODELO_ATUAL]
    - food-parsing: [openrouter/MODELO_ATUAL]

litellm_settings:
  cache: true
  cache_params:
    type: redis
    host: redis.prod.svc.cluster.local
    db: 1
    ttl: 604800
  drop_params: true

general_settings:
  store_model_in_db: false
```

`store_model_in_db: false` é deliberado: a configuração é código, entregue pelo Flux. Com
`true`, o LiteLLM guarda modelos no banco e passa a ter dois donos — o git e a UI dele —
que é o mesmo problema de drift que fez a Fase 1 desabilitar o Traefik embutido do k3s.

O cache usa a **database 1** do Redis, com TTL obrigatório, exatamente pelo motivo da
Fase 4: a política é `noeviction`, e um cache sem TTL crescendo até o `maxmemory` quebraria
a escrita da fila na database 0.

O slug do Hermes é confirmado na execução, no catálogo escolhido (OpenRouter ou a API da
própria Nous). Não fixe aqui um nome que pode ter mudado.

### 3.4 — Chave virtual com orçamento

A API não recebe a chave mestra. Ela recebe uma chave virtual, com teto — criada pelo
endpoint `/key/generate` do proxy, com `key_alias`, `max_budget`, `budget_duration`,
`rpm_limit` e a lista de `models` permitidos.

Três camadas de contenção, cada uma pegando um caso diferente:

| Camada | Onde | Pega o quê |
|---|---|---|
| `MAX_COST_USD = 0.05` | no agente, já existe | uma requisição que sai do controle |
| `rpm_limit` | chave virtual | pico de requisições |
| `max_budget` | chave virtual | gasto acumulado no mês |

O campo `models` na chave é a barreira que impede a API de pedir um modelo caro fora das
lanes — inclusive por engano num deploy.

⚠️ O `max_budget` é **global da aplicação**, não por usuário. A consequência disso quando a
API for publicada para o mobile está na Fase 10, e é um risco declarado.

### 3.5 — Privacidade dos prompts

Os prompts contêm o que o usuário comeu e transcrições de voz. Isso é dado pessoal, e o
LiteLLM grava corpo de requisição e resposta em spend logs conforme a configuração.

Decida explicitamente, e registre:

- spend logs **sem** corpo de requisição e resposta — só metadado de custo, tokens,
  modelo, latência e status;
- redação das informações da chave de usuário ligada;
- nenhum campo de prompt vira label de métrica;
- o estágio de redação no Alloy (Fase 8) como segunda linha, para o caso de algo escapar.

O que se perde é a capacidade de depurar por que o modelo respondeu aquilo olhando o log.
A troca é consciente: para depurar, reproduza com um prompt de teste, não com o dado de
alguém.

### 3.6 — A mudança em `apps/api`

Pequena e alinhada à arquitetura hexagonal que já existe.

**Em [`apps/api/src/config/env.ts`](../../apps/api/src/config/env.ts):** acrescentar
`LLM_BASE_URL` e `LLM_API_KEY`, com fallback para o valor atual — sem configurar nada,
nada muda. O `env.test.ts` cobre os dois caminhos.

**Nos dois gateways de parsing:** trocar a URL fixa pela configurada. Uma linha em cada.

**No gateway do agente:** conforme o resultado da verificação 3.2a.

**Nos nomes de modelo:** as variáveis passam a carregar lane, não slug — `event-agent`,
`event-parsing`, `food-parsing`.

```bash
# 💻 local
npm run --silent test:ai
pnpm turbo run typecheck
```

Esperado: `Tests pass`. Os três gateways já têm teste, e eles são a rede que garante que a
troca de URL não mudou comportamento.

Vale considerar renomear os arquivos de `openrouter-*` para `llm-*` num commit separado,
já que eles deixam de ser específicos de fornecedor. Renomear e mudar comportamento no
mesmo commit torna o diff ilegível.

## 4. Por que não fazer diferente

**Continuar chamando o OpenRouter direto.** O OpenRouter já é um agregador: já faz
roteamento entre fornecedores e já tem painel de custo. O argumento é bom, e se você só
quisesse trocar de modelo, não precisaria do LiteLLM. O que ele acrescenta é o que o
agregador não dá: orçamento que você controla, cache no **seu** Redis, métrica no **seu**
Grafana, e um ponto único onde a política de privacidade do prompt é aplicada.

**Uma camada de abstração própria no Nest.** Você já tem os portos — `EventAgentGateway`,
`FoodParsingGateway`, `EventCommandParsingGateway`. Escrever fallback e cache atrás deles
é viável e evita um serviço novo. Descartado porque é reescrever, com menos qualidade,
algo que existe pronto — e porque orçamento e spend tracking dentro do processo da API
significam perdê-los quando o pod reinicia.

**Rodar o modelo localmente (Ollama, vLLM).** Considerado e descartado por decisão
explícita. Sem GPU, um modelo de 8B quantizado ocupa 5–6 GiB e entrega poucos tokens por
segundo num vCPU compartilhado — inutilizável para uma rota com usuário esperando, e caro
em RAM para o que entrega. Revisitar só se houver GPU.

**Langfuse para observabilidade de prompt.** Dá rastreio no nível de prompt, com UI
própria e comparação de versões. Descartado por peso: as versões atuais querem ClickHouse
junto, que sozinho come mais RAM que todo o resto da Fase 7. A Fase 8 cobre custo, tokens
e latência com o que já existe. Revisitar se avaliação sistemática de prompt virar
objetivo.

**Portkey, Helicone e afins.** Gateways hospedados equivalentes. Descartados pelo mesmo
motivo que a stack de observabilidade voltou para casa: com 16 GiB, hospedar custa pouco e
ensina mais.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl -n prod get deploy litellm
kubectl -n prod logs deploy/litellm --tail 50
```

Esperado: `1/1` e log sem erro de conexão com o Postgres.

Liste os modelos que o proxy expõe pelo endpoint `/v1/models`. Esperado: exatamente
`event-agent`, `event-parsing` e `food-parsing`. Se aparecer um slug de fornecedor, alguma
lane vazou o nome do modelo para a aplicação.

O teste do cache, que também prova o TTL — faça a mesma requisição duas vezes,
cronometrando, e depois:

```bash
# ☸️ cluster
kubectl -n prod exec redis-0 -- redis-cli -n 1 --scan
kubectl -n prod exec redis-0 -- redis-cli -n 0 --scan
```

Esperado: a segunda chamada bem mais rápida; chaves na database **1** e nenhuma chave de
cache na **0**; e TTL positivo em todas elas. Uma chave de cache com TTL `-1` é a bomba
descrita na Fase 4.

O teste do fallback: troque temporariamente a chave do Hermes por um valor inválido,
reinicie o proxy e gere um parsing de comida pela aplicação. Esperado: a requisição
**funciona**, atendida pelo fallback, e o log do LiteLLM registra a falha do primário.
Restaure a chave e confirme que o primário voltou.

O teste do orçamento: consulte o `/key/info` da chave da API e confirme gasto acumulando
e teto correto. Vale criar uma segunda chave com orçamento de alguns centavos e estourá-la
de propósito, para ver a recusa acontecer antes de precisar confiar nela.

E o teste que importa de verdade: usar o app. Criar um evento por linguagem natural, uma
refeição por descrição, e um evento pelo agente. Os três caminhos passam por lanes
diferentes, e é o único jeito de saber que os três funcionam.

## 6. Armadilhas comuns

**`json_schema` estrito falhando em silêncio.** Alguns providers ignoram o campo e
devolvem JSON livre. O gateway então quebra no parse, com erro que parece problema de
modelo. Por isso a verificação 3.2b vem antes de tudo.

**Cache servindo resposta velha depois de trocar o prompt.** A chave de cache inclui o
prompt; mudar o system prompt muda a chave. Mas mudar a temperatura ou o modelo pode não
mudar, dependendo da configuração — e você fica testando um modelo novo com respostas do
antigo. Ao comparar modelos, desligue o cache.

**A chave mestra chegando na aplicação.** A chave mestra cria chaves e lê spend de todo
mundo. A API recebe a chave virtual, e nada mais.

**Redis enchendo pela database 1.** Descrito na Fase 4 e em 3.3. O alerta de 70% do
`maxmemory` criado lá é o que pega isso.

**`drop_params` mascarando incompatibilidade.** Ele descarta parâmetros que o modelo não
suporta em vez de falhar. Conveniente e perigoso: um `response_format` descartado em
silêncio vira JSON livre. Se o parsing ficar instável, é a primeira coisa a investigar.

**Achar que o LiteLLM substitui o teto por requisição.** As três camadas de 3.4 pegam
coisas diferentes. Não remova o `MAX_COST_USD` do agente.

## 7. Para estudar

- 🆓 [LiteLLM — Proxy Server](https://docs.litellm.ai/docs/simple_proxy) — roteamento, fallback, cache e chaves virtuais.
- 🆓 [LiteLLM — Virtual Keys e Budgets](https://docs.litellm.ai/docs/proxy/virtual_keys)
- 🆓 [OpenAI — Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — o formato `json_schema` que os dois gateways usam.
- 🆓 Documentação da API da Nous Research — confirme o slug e os limites do Hermes na execução.
- 🆓 [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — LLM01 (prompt injection) e LLM10 (consumo irrestrito) são os dois que tocam esta fase.
