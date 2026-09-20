# Ambiente local efêmero para testes de IA

`compose.yaml` descreve um ambiente de desenvolvimento separado da aplicação
principal: PostgreSQL, RabbitMQ, Grafana e placeholders para auth, api e web.

O compose usa um nome de projeto próprio e portas vinculadas a `127.0.0.1`.
Nada é publicado para a rede e nenhum serviço remoto é necessário.

## Uso

```bash
cp .agents/environments/local/.env.example .agents/environments/local/.env
docker compose --env-file .agents/environments/local/.env \
  -f .agents/environments/local/compose.yaml --profile ia-staging up -d
docker compose --env-file .agents/environments/local/.env \
  -f .agents/environments/local/compose.yaml --profile ia-staging down
```

Os valores do exemplo são placeholders. O arquivo `.env` é local e ignorado.
Use o perfil `ia-staging-app` somente quando as imagens locais de auth, api e
web estiverem disponíveis. Remova o ambiente com `down` ao terminar e não
reutilize volumes ou perfis de navegador entre sessões.
