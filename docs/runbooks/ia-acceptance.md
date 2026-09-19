# Checklist de aceitação da infraestrutura de IA

## Repositório

- [x] `.ia/manifest.yaml` existe e tem `schemaVersion`.
- [x] Exemplos não contêm tokens, cookies, senhas ou caminhos pessoais.
- [x] Estado local e segredos estão ignorados.
- [x] `scripts/ia/adapter.sh check` passa.
- [ ] Adaptador foi instalado em um ambiente limpo.

## VPS e staging

- [ ] Bootstrap executado em uma VPS Ubuntu limpa.
- [ ] SSH, firewall, proxy e secrets revisados pelo operador.
- [ ] PostgreSQL, RabbitMQ e Grafana de staging estão separados da produção.
- [ ] Auth, API e web sobem com TTL e teardown.
- [ ] Rota de staging exige autenticação.

## Browser e memória

- [ ] Smoke Playwright abre uma rota de staging protegida.
- [ ] Contextos e perfis não são reutilizados.
- [ ] Retenção dos artefatos foi verificada.
- [ ] Cada evento do ai-memory é recuperável no projeto correto.
- [ ] Falha do ai-memory não bloqueia o desenvolvimento e gera diagnóstico.

## Rollback

- [ ] `scripts/ia/adapter.sh remove` restaura o estado anterior.
- [ ] Staging pode ser destruído sem tocar produção.
- [ ] Nenhum segredo aparece em logs, artefatos ou Git.
