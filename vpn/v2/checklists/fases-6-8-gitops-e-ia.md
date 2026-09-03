# Checklist — Fases 6 a 8 (GitOps e IA)

## Fase 6 — Secrets e GitOps

- [ ] Estrutura `deploy/` criada com base, overlays e secrets
- [ ] 🔴 Chave age gerada, com duas cópias, **nenhuma no git**
- [ ] `.sops.yaml` com `encrypted_regex` limitado a `data` e `stringData`
- [ ] Secret `sops-age` criado em `flux-system`
- [ ] Flux instalado, com os dois controllers de imagem
- [ ] `flux check` e `flux get all -A` sem erro
- [ ] `ImagePolicy` filtrando tags por SHA de 40 caracteres
- [ ] 🔴 Teste de drift: `scale --replicas=5` volta sozinho para 2
- [ ] 🔴 Pipeline ponta a ponta testado, do commit ao rollout, e cronometrado
- [ ] 🔴 `git grep` por segredo em claro em `deploy/` retorna **vazio**
- [ ] Secret decifrado no cluster corresponde ao valor esperado
- [ ] 🔴 Deploy completo pelo Flux **antes** de remover o caminho antigo
- [ ] Usuário `ci` e `deploy-from-ci` removidos do servidor
- [ ] Secrets `VPS_HOST`, `VPS_USER` e `VPS_SSH_KEY` apagados do GitHub
- [ ] Job `deploy` removido do workflow; `validate` e `build` intactos
- [ ] Dashboards e alertas do Grafana migrados para o git

## Fase 7 — LiteLLM e Hermes

- [ ] 🔴 Verificado se o SDK do agente aceita `baseURL`; caminho escolhido registrado
- [ ] 🔴 Verificado o suporte a `json_schema` estrito na lane Hermes; plano B registrado
- [ ] 🔴 Verificado se o `/metrics` do LiteLLM existe na versão escolhida
- [ ] Slug do Hermes confirmado no catálogo, e registrado
- [ ] Proxy `Running`, conectado à database `litellm`
- [ ] 🔴 `store_model_in_db: false` — configuração vem do git
- [ ] `/v1/models` expõe **apenas** as três lanes, sem slug de fornecedor
- [ ] Fallback configurado nas lanes de parsing e **ausente** na do agente
- [ ] 🔴 Cache na database 1 do Redis, com TTL positivo em todas as chaves
- [ ] 🔴 Nenhuma chave de cache na database 0
- [ ] Chave virtual com orçamento, limite por minuto e lista de modelos
- [ ] 🔴 A aplicação **não** recebe a chave mestra
- [ ] 🔴 Spend logs sem corpo de requisição e resposta
- [ ] `LLM_BASE_URL` e `LLM_API_KEY` em `env.ts`, com fallback e teste
- [ ] URL fixa removida dos dois gateways de parsing
- [ ] 🔴 `npm run --silent test:ai` imprime `Tests pass`
- [ ] `pnpm turbo run typecheck` sem erro
- [ ] Teste de fallback executado com chave inválida, e restaurado
- [ ] Teste de orçamento: chave de teste estourada de propósito
- [ ] 🔴 Os três caminhos testados pelo app: comando, refeição e agente

## Fase 8 — Tracing e observabilidade de LLM

- [ ] `tracing.ts` carregado **antes** do Nest
- [ ] Spans manuais em volta da chamada ao LiteLLM e da execução de skill
- [ ] 🔴 Nenhum prompt ou transcrição em atributo de span
- [ ] `traceparent` propagado pelo `fetchFromBackend`
- [ ] 🔴 Trace único e contínuo: Next, Nest, LiteLLM, provider, PostgreSQL
- [ ] Amostragem configurada: 100% em IA e erro, 10% em leitura, 0% em health
- [ ] Retenção de traces em 3 dias
- [ ] Os seis painéis de custo, tokens, latência, cache e fallback com dado
- [ ] SLOs definidos a partir do baseline da Fase 0
- [ ] Alerta por burn rate multi-janela, testado parando o LiteLLM
- [ ] 🔴 Latência das rotas de IA **medida mas não alertada**
- [ ] 🔴 Teste de redação: frase reconhecível gerada e **não encontrada** nos logs
- [ ] Cardinalidade conferida: nenhuma label com ID no topo das séries
