# Checklist — Fases 0 a 2 (servidor)

## Fase 0 — Diagnóstico e limpeza

- [ ] 🔴 Snapshot criado no painel da HostGator (data: ________)
- [ ] Localizado o console de emergência (VNC/KVM) do painel — **antes** de precisar
- [ ] Inventário coletado e salvo localmente (`uname`, `free`, `df`, `ss`, serviços)
- [ ] 🔴 Virtualização confirmada como `kvm` ou `none` (não OpenVZ)
- [ ] RAM total confirmada (≥ 3.7Gi) — anotado: ________
- [ ] Disco livre confirmado (≥ 20G) — anotado: ________
- [ ] Presença de IPv6 global verificada — sim / não: ________
- [ ] k3s removido (`k3s-uninstall.sh`) e resíduos conferidos
- [ ] Portas 80 e 443 liberadas (Apache/Nginx desabilitados)
- [ ] `ss -tulpn` mostra apenas o esperado
- [ ] Termos do plano conferidos: não-gerenciado, snapshot incluso?

## Fase 1 — Hardening do SO

- [ ] 🔴 **Duas sessões SSH abertas durante toda a fase**
- [ ] Chave Ed25519 gerada com passphrase
- [ ] `ssh-agent` configurado na máquina local
- [ ] Usuário `deploy` criado, no grupo `sudo`
- [ ] Chave pública instalada, permissões 700/600 corretas
- [ ] 🔴 Login como `deploy` testado **antes** de endurecer o SSH
- [ ] `99-hardening.conf` criado, `sshd -t` validado
- [ ] 🔴 Login por senha falha (`Permission denied (publickey)`)
- [ ] 🔴 Login como root falha
- [ ] `IPV6=yes` no `/etc/default/ufw`
- [ ] 🔴 Regra do SSH confirmada com `ufw show added` **antes** de `ufw enable`
- [ ] UFW ativo, default deny, regras 22/80/443 presentes em IPv4 **e** (v6)
- [ ] Swap de 4GB ativo e no `/etc/fstab`
- [ ] `vm.swappiness=10` aplicado e persistente
- [ ] `unattended-upgrades` instalado e configurado (reboot automático controlado)
- [ ] fail2ban ativo, jail `sshd` habilitado
- [ ] Timezone e NTP sincronizados
- [ ] Serviços desnecessários desabilitados (MTA, MySQL etc.)
- [ ] `lynis audit system` rodado — Hardening Index inicial: ________

## Fase 2 — Docker

- [ ] Docker instalado pelo repositório oficial (não `docker.io`, não script)
- [ ] `deploy` no grupo `docker`, sessão reiniciada
- [ ] 🔴 `daemon.json` com `log-opts` (`max-size`, `max-file`)
- [ ] `live-restore`, `userland-proxy: false`, `no-new-privileges` configurados
- [ ] Nome real da interface de rede confirmado: ________
- [ ] 🔴 Regras `DOCKER-USER` aplicadas
- [ ] 🔴 `netfilter-persistent save` executado
- [ ] Redes criadas: `edge`, `internal` (--internal), `observability` (--internal)
- [ ] `internal` confirmada sem acesso à internet (teste do `wget`)
- [ ] 🔴 **Teste do furo do firewall executado** — porta 9999 bloqueada de fora
- [ ] Porta 80 confirmada alcançável (Traefik vai funcionar)
- [ ] `/opt/stack/` criado com permissões corretas
- [ ] 🔴 **Reboot feito e tudo persistiu** (iptables, swap, UFW, containers)
