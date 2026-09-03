# Checklist — Fases 9 a 11 (expansão e fechamento)

## Fase 9 — Staging

- [ ] Overlay Kustomize, **não** cópia dos manifestos
- [ ] `diff` entre os overlays mostra só as diferenças previstas
- [ ] Uma réplica de web e api, `PriorityClass: low`
- [ ] Database `timeline_staging` e role `staging_app` em uso
- [ ] 🔴 `staging_app` **não** enxerga o schema de produção
- [ ] Pool de staging limitado a 3 conexões
- [ ] Redis próprio, 128 MiB
- [ ] Chave virtual de LLM própria, com orçamento pequeno
- [ ] 🔴 Ingress com autenticação: sem credencial retorna 401
- [ ] Cabeçalho `X-Robots-Tag: noindex` presente
- [ ] 🔴 Nenhum dado de produção copiado; estratégia de seed registrada
- [ ] Alertas de staging separados dos de produção, em outro canal
- [ ] Teste de despejo: sob pressão, staging cai antes de `prod`

## Fase 10 — API pública

- [ ] 🔴 Risco de ausência de quota por usuário lido e aceito por escrito
- [ ] Ingress `api.SEUDOMINIO.com` com certificado **próprio**
- [ ] Middlewares próprios: rate limit apertado e limite de corpo de 1 MiB
- [ ] CORS em allowlist explícita, sem curinga
- [ ] Rate limit por usuário autenticado, usando o Redis existente
- [ ] Alerta de custo em metade do orçamento mensal
- [ ] Access log com headers derrubados por padrão
- [ ] `console.log` dos gateways de IA relidos com olhos de log de 14 dias
- [ ] `events.routing.test.ts` passando — rotas estáticas antes de `:eventId`
- [ ] `MOBILE_API_URL` em HTTPS, apontando para produção
- [ ] 🔴 Sem token: `/events/daily` retorna 401
- [ ] Origem não autorizada: resposta sem `Access-Control-Allow-Origin`
- [ ] Rate limit: sequência de 200 vira 429
- [ ] Corpo grande: retorna 413
- [ ] 🔴 `nmap` externo amplo: apenas 22, 80 e 443 abertas
- [ ] 🔴 App testado no celular, **fora da rede local**, pelos dados móveis
- [ ] Requisições do celular nos logs, sem token e sem dado pessoal

## Fase 11 — Corte final

- [ ] 🔴 Duas semanas de produção no cluster sem incidente que exigisse voltar
- [ ] 🔴 Restore testado a partir do externo, depois do corte
- [ ] 🔴 Medição de sete dias completa
- [ ] 🔴 Ao menos um deploy completo pelo Flux, do commit ao rollout
- [ ] 🔴 Ao menos um rollback executado de verdade
- [ ] 🔴 Tabela de comparação com a Fase 0 preenchida e interpretada
- [ ] Nenhum número piorado sem explicação
- [ ] Compose parado por mais uma semana antes de remover
- [ ] `/opt/stack` arquivado para o destino externo
- [ ] 🔴 Credenciais do arquivo arquivado rotacionadas
- [ ] 🔴 Volumes do Docker removidos **somente** com backup validado
- [ ] Coleta do Docker retirada do Alloy; socket desmontado
- [ ] Nenhum painel do Grafana ficou vazio
- [ ] Runbook e checklist de segurança reescritos, sem `docker compose`
- [ ] Todas as pendências da tabela 3.6 fechadas
- [ ] Folga acima de 4 GiB, disco com margem
- [ ] 🔴 Página escrita: como recriar o servidor do zero a partir do git e do backup
- [ ] Nenhum passo dessa página depende de arquivo que só existe no servidor atual
