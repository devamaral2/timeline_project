# Checklist — Pré-produção

O portão antes de expor a aplicação publicamente ou colocar qualquer dado real.
**Todos os itens são bloqueantes.**

## Rede e acesso

- [ ] `ss -tulpn` mostra apenas 22, 80, 443 em `0.0.0.0`/`[::]`
- [ ] Teste externo: 5432, 6379, 8428, 3100, 8080, 9100 todos recusam conexão
- [ ] Regra `DOCKER-USER` ativa e persistente após reboot
- [ ] UFW cobrindo IPv4 **e** IPv6
- [ ] SSH só por chave; root bloqueado
- [ ] Chave do CI restrita por `command=` — testado com `ssh ... "cat /etc/passwd"`

## Dados

- [ ] Backup automático agendado no cron
- [ ] Backup chegando ao bucket externo (verificado com `rclone ls`)
- [ ] 🔴 **Restauração testada a partir do bucket** — data: ________
- [ ] Usuário de aplicação sem privilégios administrativos no Postgres
- [ ] Redis exige senha (`redis-cli ping` → `NOAUTH`)
- [ ] `FLUSHALL`, `FLUSHDB` e `CONFIG` desabilitados no Redis
- [ ] Política de `maxmemory` correta para o uso (cache ≠ fila)

## Aplicação e proxy

- [ ] HTTPS funcionando com certificado de produção (não staging)
- [ ] Redirecionamento HTTP → HTTPS ativo
- [ ] HSTS ativo (só depois do TLS estável)
- [ ] Nota A ou A+ no SSL Labs — nota obtida: ________
- [ ] Headers de segurança presentes; `Server` e `X-Powered-By` ausentes
- [ ] Rate limit devolvendo 429 sob carga
- [ ] Dashboard do Traefik inacessível sem autenticação
- [ ] Grafana atrás de basic auth (401 sem credencial)
- [ ] `/metrics` não acessível publicamente
- [ ] Todos os containers com `mem_limit` — nenhum `0`
- [ ] Todos os containers de aplicação rodando como não-root

## Operação

- [ ] Rotação de log do Docker ativa
- [ ] Retenção do Loki configurada (168h)
- [ ] Alerta de disco >80% configurado **e testado**
- [ ] Alerta de container perto do limite de memória
- [ ] Alerta de aplicação fora do ar
- [ ] Notificações chegando ao canal escolhido (Telegram/Discord)
- [ ] Rollback ensaiado ao menos uma vez
- [ ] `docker stats` somando abaixo de 2.5GB

## GitHub

- [ ] 2FA ativo na conta
- [ ] Branch protection em `main`, sem bypass
- [ ] Secret scanning + push protection ativos
- [ ] Dependabot configurado (npm, docker, github-actions)
- [ ] Actions de terceiros fixadas por tag ou SHA
- [ ] Visibilidade dos pacotes no GHCR conferida manualmente
- [ ] Nenhum segredo no histórico do git (`git log --all -- "*.env"`)

## Documentação

- [ ] Senhas guardadas no gerenciador de senhas
- [ ] Data do último teste de restauração anotada
- [ ] `docs/README.md` com as fases marcadas como concluídas
