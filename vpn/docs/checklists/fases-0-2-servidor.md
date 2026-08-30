# Checklist — Fases 0 a 2 (servidor)

## Fase 0 — diagnóstico

- [ ] VPS confirmado com pelo menos 4 GiB de RAM
- [ ] CPU, disco e virtualização registrados
- [ ] Dados antigos identificados e preservados antes da limpeza
- [ ] k3s e recursos órfãos removidos conforme o inventário
- [ ] Pelo menos 15 GiB livres para imagens, dados e backups temporários

## Fase 1 — sistema operacional

- [ ] Usuário administrativo sem login root remoto
- [ ] SSH somente por chave
- [ ] UFW permite apenas 22, 80 e 443
- [ ] IPv4 e IPv6 verificados
- [ ] Atualizações automáticas de segurança habilitadas
- [ ] Swap de 4 GiB e `vm.swappiness=10`
- [ ] Relógio/NTP correto

## Fase 2 — Docker

- [ ] Docker instalado pelo repositório oficial
- [ ] Logs Docker com rotação
- [ ] Regras `DOCKER-USER` testadas externamente
- [ ] Redes `edge`, `data` e `observability` criadas
- [ ] `data` e `observability` retornam `Internal=true`
- [ ] `edge` retorna `Internal=false`
- [ ] Container ligado somente a `data` não alcança a internet
- [ ] Diretórios `/opt/stack/{traefik,apps,data,observability,backups}` criados
- [ ] Padrão de `mem_limit`, `memswap_limit` e `no-new-privileges` documentado
- [ ] Teste deliberado confirma que porta Docker não autorizada é bloqueada
