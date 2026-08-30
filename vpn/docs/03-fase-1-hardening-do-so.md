# Fase 1 — Hardening do sistema operacional

## Objetivo

Ao final desta fase, o servidor tem um usuário não-root com sudo, SSH acessível apenas
por chave, firewall com política de negação padrão (IPv4 **e** IPv6), 4GB de swap,
atualizações de segurança automáticas, fail2ban e relógio sincronizado.

---

## Por que isso existe

Um VPS com IP público começa a receber tentativas de login em SSH **em minutos**. Não é
exagero retórico: bots varrem faixas inteiras de IP continuamente. Se você deixar senha
habilitada e a senha for fraca, a invasão é questão de horas, não de sorte.

Cada item desta fase fecha um vetor concreto:

- **Chave em vez de senha** elimina força bruta por completo. Uma chave Ed25519 não é
  adivinhável; uma senha de 12 caracteres é, dado tempo suficiente.
- **Usuário não-root** significa que um comando errado (ou uma exploração) não tem poder
  total imediato. É a diferença entre um susto e um desastre.
- **Firewall default-deny** garante que um serviço que você esqueceu de configurar não
  fique exposto por descuido. Você abre o que precisa, não fecha o que sobra.
- **Swap** evita que um pico de memória mate o Postgres.
- **Updates automáticos** fecham CVEs enquanto você dorme. A maioria das invasões usa
  falha conhecida com patch disponível há meses.
- **Relógio correto** — parece detalhe, mas relógio errado quebra validação de
  certificado TLS e torna logs inúteis para correlacionar incidentes.

🔒 Toda esta fase está no [checklist de segurança](11-seguranca-checklist.md).

---

## Passo a passo

### ⚠️ Regra de sobrevivência

**Abra duas sessões SSH e mantenha as duas abertas durante toda esta fase.** Faça as
mudanças na sessão A. Teste na sessão B **antes** de fechar a A. Se você errar a
configuração do SSH ou do firewall e só tiver uma sessão, você perdeu o acesso ao
servidor e vai depender do console de emergência da HostGator (quando existe) ou de
reinstalar.

Esta é a regra mais importante do documento. Ninguém acha que vai errar, e todo mundo
erra pelo menos uma vez.

### 1.1 — Gerar a chave SSH (na sua máquina)

```bash
# 💻 local
ssh-keygen -t ed25519 -a 100 -C "amaral@vps-hostgator" -f ~/.ssh/vps_hostgator
```

O que cada opção faz:

- `-t ed25519` — algoritmo moderno. Chaves menores, mais rápidas e mais seguras que RSA.
  Use RSA 4096 apenas se precisar compatibilizar com sistema antigo.
- `-a 100` — 100 rounds de KDF na derivação da passphrase, encarecendo ataque offline
  caso alguém obtenha o arquivo da chave privada.
- `-C` — comentário identificando a chave. Útil quando você tiver várias.
- `-f` — nome do arquivo. Nomear por servidor evita reusar a mesma chave em tudo.

🔒 **Use uma passphrase.** Sem ela, quem copiar o arquivo da sua máquina tem seu servidor.
Para não digitar a toda hora, use o `ssh-agent`:

```bash
# 💻 local (PowerShell, como admin, uma vez)
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\vps_hostgator
```

### 1.2 — Criar o usuário não-root

```bash
# 🖥️ servidor — como root
adduser deploy
usermod -aG sudo deploy
```

Escolha uma senha forte para o `deploy`. Ela **não** será usada para SSH (que será só por
chave), mas sim para o `sudo`. Guarde no seu gerenciador de senhas.

Instale sua chave pública no novo usuário:

```bash
# 🖥️ servidor — como root
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys   # cole o conteudo de vps_hostgator.pub
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

Para ver o conteúdo da chave pública na sua máquina:

```bash
# 💻 local
cat ~/.ssh/vps_hostgator.pub
```

As permissões importam: o `sshd` **recusa** a chave se o diretório ou o arquivo estiverem
com permissão frouxa. É a causa nº 1 de "minha chave não funciona".

⚠️ **Na sessão B, teste antes de continuar:**

```bash
# 💻 local
ssh -i ~/.ssh/vps_hostgator deploy@SEU_IP
sudo whoami    # deve responder: root
```

Só prossiga se isso funcionar.

### 1.3 — Endurecer o SSH

```bash
# 🖥️ servidor
sudo nano /etc/ssh/sshd_config.d/99-hardening.conf
```

Conteúdo:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy
```

Por que um arquivo em `sshd_config.d/` em vez de editar `sshd_config` direto: as
atualizações do pacote podem sobrescrever o arquivo principal, e o diretório `.d` é
preservado. Também fica óbvio o que você mudou versus o que veio de fábrica.

Sobre `AllowUsers deploy`: é uma lista de permissão explícita. Mesmo que outro usuário
exista com chave válida, o SSH recusa. Lembre-se de adicionar aqui o usuário do CI na
[Fase 7](09-fase-7-cicd-github-actions.md), se optar por um usuário separado.

⚠️ Valide a sintaxe **antes** de reiniciar — um erro aqui derruba o `sshd`:

```bash
# 🖥️ servidor
sudo sshd -t && echo "sintaxe OK"
sudo systemctl restart ssh
```

Teste em uma **nova** sessão antes de fechar as atuais.

**Sobre trocar a porta 22:** é comum recomendarem mudar para uma porta alta. Isso reduz
drasticamente o *ruído* nos logs, mas não é segurança real — um scan de portas encontra
em segundos. Com chave-apenas + fail2ban, o ganho é cosmético. Se te incomoda ver
milhares de tentativas no log, mude; só não confunda com proteção.

### 1.4 — Firewall (UFW) — IPv4 e IPv6

🔒 Este é um dos pontos onde mais se erra.

Primeiro, garanta que o UFW gerencia IPv6:

```bash
# 🖥️ servidor
sudo grep IPV6 /etc/default/ufw
```

Deve mostrar `IPV6=yes`. Se mostrar `no`, edite e corrija. **Se o seu VPS tem IPv6 ativo
(você verificou na fase 0) e o firewall só cobre IPv4, todos os seus serviços continuam
alcançáveis pela internet via IPv6.** O firewall dá uma falsa sensação de proteção
enquanto a porta dos fundos está escancarada.

```bash
# 🖥️ servidor
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP - Traefik/ACME'
sudo ufw allow 443/tcp comment 'HTTPS - Traefik'
```

⚠️ Confirme que a regra do SSH existe antes de habilitar. `ufw enable` com a 22 fechada
te tranca para fora imediatamente.

```bash
# 🖥️ servidor
sudo ufw show added        # confira: a linha do 22 esta ai?
sudo ufw enable
sudo ufw status verbose
```

**Restringir o SSH ao seu IP** é a melhoria mais eficaz aqui, se você tiver IP fixo:

```bash
# 🖥️ servidor — apenas se seu IP for fixo
sudo ufw delete allow 22/tcp
sudo ufw allow from SEU_IP_FIXO to any port 22 proto tcp
```

Com IP residencial dinâmico, isso te tranca para fora quando o IP mudar. Nesse caso,
fique com a regra aberta + fail2ban. Lembre-se de que o GitHub Actions precisa alcançar
a 22 na fase 7 — os IPs dele são muitos e mudam, então restringir por IP significa
mudar a estratégia de deploy (documentado na ADR-007).

### 1.5 — Swap

```bash
# 🖥️ servidor
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

O `chmod 600` importa: o arquivo de swap contém memória de processos em texto claro.
Legível por qualquer usuário seria um vazamento sério.

A linha no `/etc/fstab` faz o swap voltar após reboot. Sem ela, você perde a proteção
silenciosamente no próximo restart.

```bash
# 🖥️ servidor
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.d/99-swap.conf
sudo sysctl --system
```

`vfs_cache_pressure=50` faz o kernel reter mais tempo o cache de metadados de arquivos —
ajuda com Docker, que lida com muitos arquivos pequenos em camadas.

### 1.6 — Atualizações automáticas de segurança

```bash
# 🖥️ servidor
sudo apt update && sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

```bash
# 🖥️ servidor
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
```

Garanta que apenas o repositório de segurança está ativo e que o reboot automático está
controlado:

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "false";
```

**Por que `Automatic-Reboot "false"`:** um reboot no meio do dia derruba tudo sem aviso.
Atualizações de kernel só valem depois do reboot, então você precisa reiniciar de tempos
em tempos — mas na hora que você escolher. Se preferir automatizar, use
`Automatic-Reboot-Time "04:00"`. Só não deixe `true` sem horário.

Isso também deixa `Remove-Unused-Kernel-Packages` ligado, o que evita que `/boot` encha
de kernels antigos — problema clássico que quebra o próximo `apt upgrade`.

### 1.7 — fail2ban

```bash
# 🖥️ servidor
sudo apt install -y fail2ban
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
```

```bash
# 🖥️ servidor
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

Com `PasswordAuthentication no`, o fail2ban tem valor reduzido — não há senha para
adivinhar. Ele continua útil para conter o volume de tentativas, que consome CPU e polui
o log. Na [Fase 5](07-fase-5-traefik-e-tls.md) veremos o equivalente para camada 7
(rate limit no Traefik), que é onde a proteção realmente importa depois.

### 1.8 — Relógio e timezone

```bash
# 🖥️ servidor
sudo timedatectl set-timezone America/Sao_Paulo
timedatectl status
```

Procure por `System clock synchronized: yes` e `NTP service: active`. Relógio dessincronizado
faz o Let's Encrypt recusar a emissão de certificado e torna impossível correlacionar logs
entre servidor e CI.

### 1.9 — Desabilitar serviços desnecessários

Com base no inventário da fase 0:

```bash
# 🖥️ servidor — ajuste conforme o que voce encontrou
sudo systemctl disable --now postfix exim4 2>/dev/null
```

Cada serviço rodando é RAM consumida e superfície de ataque. Um MTA local mal configurado
já foi vetor de spam relay em incontáveis servidores.

---

## Por que não fazer diferente

**"Por que não usar senha forte em vez de chave?"** — Senha é um segredo que trafega e
pode ser adivinhada, capturada por keylogger ou reusada de um vazamento. Chave privada
nunca sai da sua máquina; o servidor só vê um desafio assinado. Não é uma questão de
grau, é de categoria.

**"Por que não `iptables` direto em vez de UFW?"** — UFW é uma camada fina sobre
`iptables`/`nftables` que evita erros comuns de ordem de regras. Você perde controle fino
que só importa em cenários complexos. Aprender `iptables` puro é valioso, mas errar a
ordem de uma regra é como você se tranca para fora. Use UFW e leia `iptables -L -n` para
entender o que ele gerou — o melhor dos dois mundos. **Exceção real:** na
[Fase 2](04-fase-2-docker.md) você vai precisar de uma regra `DOCKER-USER` em iptables
puro, porque o UFW não alcança aquele ponto da cadeia.

**"Por que não SELinux/AppArmor com política restritiva?"** — Ganho real, mas o custo de
manutenção é alto e o modo de falha é confuso: as coisas param de funcionar sem log
óbvio. O AppArmor já vem ativo em modo padrão no Ubuntu e o Docker traz perfis próprios
para containers. Isso é um degrau adequado para depois, não para o primeiro servidor.

**"Por que não usar root direto, já que é meu servidor?"** — Porque a proteção não é
contra você, é contra o comando errado e contra o processo comprometido. Um `rm -rf` com
variável vazia como root apaga o sistema; como `deploy`, dá erro de permissão. Além
disso, `sudo` deixa rastro auditável de quem fez o quê e quando.

**"Por que não Ansible para automatizar tudo isso?"** — Excelente ideia para o segundo
servidor. Para o primeiro, executar manualmente ensina o que cada passo faz. Automatizar
o que você não entende produz um playbook que você não sabe consertar. Anote como
próximo passo natural de estudo.

---

## Como garantir que está certo

**Login por senha deve falhar:**

```bash
# 💻 local
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no deploy@SEU_IP
```
→ Esperado: `Permission denied (publickey)`. Se pedir senha, `PasswordAuthentication no`
não foi aplicado — confira se editou o arquivo certo e reiniciou o serviço.

**Root não deve logar:**

```bash
# 💻 local
ssh -i ~/.ssh/vps_hostgator root@SEU_IP
```
→ Esperado: `Permission denied`.

**Firewall ativo nos dois protocolos:**

```bash
# 🖥️ servidor
sudo ufw status verbose
```
→ Esperado: `Status: active`, `Default: deny (incoming)`, e cada regra aparecendo **duas
vezes** — uma sem sufixo (IPv4) e uma com `(v6)`. Se as `(v6)` não aparecerem e o
servidor tem IPv6, volte ao passo 1.4.

**Swap ativo e persistente:**

```bash
# 🖥️ servidor
swapon --show
cat /proc/sys/vm/swappiness
grep swapfile /etc/fstab
```
→ Esperado: 4G em `/swapfile`; `10`; e a linha presente no fstab.

**Updates automáticos funcionando:**

```bash
# 🖥️ servidor
sudo unattended-upgrades --dry-run --debug 2>&1 | tail -20
```
→ Esperado: menções a "Allowed origins" e nenhum erro de configuração.

**fail2ban vigiando:**

```bash
# 🖥️ servidor
sudo fail2ban-client status sshd
```
→ Esperado: jail ativo, com contagem de falhas (provavelmente já diferente de zero — os
bots são rápidos).

**Relógio:**

```bash
# 🖥️ servidor
timedatectl status | grep -E 'synchronized|NTP'
```
→ Esperado: `yes` e `active`.

**Teste externo consolidado** — do seu Windows:

```bash
# 💻 local (PowerShell)
Test-NetConnection SEU_IP -Port 22
Test-NetConnection SEU_IP -Port 3306
```
→ Esperado: 22 sucesso, 3306 falha. Qualquer porta inesperada respondendo é um problema.

---

## Armadilhas comuns

**Trancar-se para fora.** Já foi dito, mas repetindo porque é o erro que custa mais caro:
duas sessões abertas, sempre. Se acontecer, o console web/VNC do painel da HostGator é
sua saída — localize onde ele fica **antes** de precisar.

**`sudo: unable to resolve host`** — o hostname do servidor não está em `/etc/hosts`.
Inofensivo, mas irritante. Adicione `127.0.1.1 SEU_HOSTNAME` no `/etc/hosts`.

**A chave não funciona e a mensagem não ajuda.** Quase sempre é permissão. Verifique:
`/home/deploy` deve ser `755` ou mais restrito, `.ssh` deve ser `700`, `authorized_keys`
deve ser `600`, e tudo deve pertencer a `deploy:deploy`. Para diagnosticar,
`ssh -vvv` do lado do cliente e `sudo journalctl -u ssh -f` do lado do servidor,
simultaneamente.

**`fallocate` falha com "operation not supported"** — alguns sistemas de arquivos não
suportam. Alternativa:
`sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress`.

**UFW ativado sem regra de SSH.** Se você tem console de emergência, `ufw disable`
resolve. Se não tem, é reinstalação. Sempre `ufw show added` antes de `ufw enable`.

**Esquecer que o Docker vai furar esse firewall.** Tudo que você configurou aqui é
verdade — até você subir um container com `ports:`. A [Fase 2](04-fase-2-docker.md)
trata disso, e é obrigatória. Não considere o servidor seguro até tê-la concluído.

---

## Para estudar

- 🆓 **`man sshd_config`** — a referência definitiva. Vale ler as opções que você acabou
  de configurar para entender o que cada uma realmente faz.
- 🆓 **Mozilla OpenSSH Guidelines** (infosec.mozilla.org) — recomendações de cifras e
  algoritmos mantidas por gente séria, com justificativa para cada escolha.
- 🆓 **DigitalOcean: "Initial Server Setup"** — a série cobre exatamente esta fase, é bem
  escrita e atualizada com frequência.
- 🆓 **Lynis** (`sudo apt install lynis && sudo lynis audit system`) — auditoria
  automatizada que aponta o que ainda falta endurecer. Rode ao final desta fase e leia
  as sugestões; é um ótimo material de estudo dirigido.
- 🆓 **Canal NetworkChuck (YouTube)** — os vídeos de SSH e hardening de Linux são
  didáticos e cobrem chaves e fail2ban com boa intuição visual.
- 💰 **"Linux Basics for Hackers"** (OccupyTheWeb) — apesar do título, é um bom curso de
  administração Linux pela perspectiva de quem ataca, o que fixa por que cada defesa
  existe.
