# Checklist — liberação do primeiro deploy

## Aplicações

- [ ] Web e API usam o mesmo SHA de release
- [ ] Web responde `/health` externamente
- [ ] Proxy `/api/*` alcança a API pela rede Docker
- [ ] API responde `/health`, `/ready` e `/metrics` internamente
- [ ] API continua usando Firebase/Firestore
- [ ] PostgreSQL e Redis não aparecem no ambiente da API
- [ ] Mobile não aponta para a API de produção ainda

## Exposição e segredos

- [ ] Somente 22, 80 e 443 estão abertos
- [ ] Somente web possui router Traefik
- [ ] API, PostgreSQL, Redis e Alloy não têm porta pública
- [ ] TLS válido, headers e rate limit confirmados
- [ ] `.env` e tokens no VPS têm modo `600`
- [ ] Imagens e histórico Docker não contêm segredos privados
- [ ] Firebase público foi fornecido como configuração de build, não como segredo privado

## Dados

- [ ] PostgreSQL e Redis estão `healthy`
- [ ] Roles seguem menor privilégio
- [ ] Redis usa `noeviction`
- [ ] Backup externo diário está agendado
- [ ] Restore de globals, database e Redis foi executado a partir do destino externo
- [ ] Nenhum dado real será migrado sem plano Firestore→PostgreSQL aprovado

## Operação

- [ ] Todos os containers têm `mem_limit` e `memswap_limit`
- [ ] Soma inicial dos limites é 1.504 MiB
- [ ] Reserva de auth/jobs mantém envelope em 1.952 MiB
- [ ] Alloy envia métricas e logs ao Grafana Cloud
- [ ] Alertas e sonda externa foram exercitados
- [ ] Deploy e rollback conjunto por SHA foram testados
- [ ] `docker stats` será acompanhado por sete dias
- [ ] Sem swap persistente e com pelo menos 1 GiB de folga medida
