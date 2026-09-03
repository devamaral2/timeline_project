# Checklist — Fases 0 a 2 (plataforma)

## Fase 0 — Baseline

- [ ] 🔴 RAM confirmada entre 15 e 16 GiB (`free -h`)
- [ ] 🔴 Ao menos 30 GiB livres em `/`
- [ ] Inventário do que roda hoje, com `RELEASE_SHA` e imagens exatas
- [ ] 🔴 Tabela de sete dias preenchida: RAM média, pico e % do limite por container
- [ ] 🔴 Latência de baseline registrada: p50/p95 da timeline e das rotas de IA
- [ ] Taxa de erro e conexões do PostgreSQL registradas
- [ ] 🔴 Backup gerado, enviado e **restaurado** a partir do armazenamento externo
- [ ] 🔴 Restore conferido por contagem de linhas e `max(created_at)` recente
- [ ] 🔴 Critérios de aborto escritos, incluindo o limiar de p95 para reverter
- [ ] Anotado se a semana medida foi atípica

## Fase 1 — k3s

- [ ] 🔴 `ufw status` conferido **antes** da instalação
- [ ] Decisão sobre swap tomada e registrada; `/etc/fstab` ajustado se desligado
- [ ] 🔴 k3s instalado com versão fixa, não `latest`
- [ ] 🔴 `--disable=traefik` e `--disable=servicelb` efetivos (nenhum pod deles)
- [ ] 🔴 `k3s secrets-encrypt status` retorna `Enabled`
- [ ] 🔴 kubeconfig em modo 600 no servidor e na máquina local
- [ ] 🔴 `nmap` externo mostra a porta 6443 como `filtered`
- [ ] `kubectl get nodes` funciona por túnel SSH
- [ ] Namespaces `prod`, `ingress`, `observability` e `staging` criados
- [ ] Três `PriorityClass` criadas, com `prod-default` como padrão global
- [ ] 🔴 Backup do datastore (`db`, `token`, `tls`) incluído no `backup.sh`
- [ ] Consumo subiu entre 500 e 800 MiB; contagem de containers Docker inalterada

## Fase 2 — Observabilidade

- [ ] Alloy, VictoriaMetrics, VictoriaLogs, Tempo, Grafana e kube-state-metrics `Running`
- [ ] Três PVCs em `Bound`, somando 45 GiB
- [ ] 🔴 Soma dos PVCs conferida contra o disco livre da Fase 0
- [ ] 🔴 Métricas dos containers **Docker** visíveis (a comparação depende disso)
- [ ] Métricas do host e do cluster visíveis
- [ ] 🔴 Logs sem token, sem cabeçalho de autorização e sem dado pessoal
- [ ] Span sintético chega ao Tempo pelo Alloy
- [ ] 🔴 Grafana com autenticação; senha inicial trocada; sem rota pública
- [ ] Labels restritos a namespace, app, container, environment, job e route normalizada
- [ ] 🔴 Alerta de disco acima de 80% criado **nesta fase**
- [ ] 🔴 Sonda externa configurada e **testada** derrubando o web de propósito
- [ ] Sonda aponta para o domínio, não para o IP
