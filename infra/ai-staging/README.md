# Ambiente de staging efêmero para IA

`compose.yaml` descreve um ambiente de desenvolvimento separado da produção:
PostgreSQL, RabbitMQ, Grafana e placeholders para auth, api e web.

O compose usa o profile `ia-staging`, nomes de projeto próprios e portas
vinculadas a `127.0.0.1`. A exposição externa deve ser feita por um proxy da
VPS com autenticação, nunca abrindo as portas dos containers diretamente.

## Uso

```bash
cp infra/ai-staging/.env.example infra/ai-staging/.env
docker compose --env-file infra/ai-staging/.env \
  -f infra/ai-staging/compose.yaml --profile ia-staging up -d
docker compose --env-file infra/ai-staging/.env \
  -f infra/ai-staging/compose.yaml --profile ia-staging down
```

Os valores do exemplo são placeholders. Antes de usar na VPS, configure
segredos fora do Git, TTL/limpeza e a camada de autenticação do proxy.
