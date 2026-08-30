# Fase 0 — Diagnóstico do VPS e limpeza do k3s

## Objetivo

Ao final desta fase você tem um inventário escrito do que o servidor realmente é
(kernel, virtualização, RAM, disco, portas em uso), um snapshot de segurança, e o k3s
completamente removido — liberando ~600–800MB.

---

## Por que isso existe

Quase todo desastre de infraestrutura começa com uma suposição não verificada. "Achei
que tinha 4GB" — o painel anuncia 4GB, mas `free -h` mostra 3.7GB porque parte vai para
o kernel. "Achei que era Ubuntu 22" — é Ubuntu 20, e metade dos comandos do tutorial não
existe. "Achei que a porta 80 estava livre" — tem um Apache que veio na imagem padrão.

Existe um caso específico que mata este projeto inteiro se não for verificado antes:
**virtualização OpenVZ/Virtuozzo**. VPS OpenVZ compartilham o kernel do host, não
permitem carregar módulos, e o Docker ou não roda ou roda de forma instável. Se seu VPS
for OpenVZ, é melhor descobrir agora — no minuto zero — do que na fase 5 depois de dois
dias de trabalho. A HostGator usa majoritariamente KVM nos planos atuais, mas planos
antigos migrados podem ser outra coisa.

O snapshot existe porque a fase 1 mexe em SSH e firewall — as duas coisas que, se você
errar, te trancam para fora do próprio servidor. Snapshot é a diferença entre "reverto
em 5 minutos" e "abro chamado no suporte e espero 12 horas".

---

## Passo a passo

### 0.1 — Snapshot antes de qualquer coisa

⚠️ Faça isto **antes** de executar qualquer comando de modificação.

No painel da HostGator, procure por *Snapshots* / *Backups* / *Instantâneos* na área do
VPS e crie um snapshot manual. Anote a data e o nome.

Se o seu plano não oferecer snapshot, anote isso — significa que sua estratégia de
recuperação depende inteiramente dos backups que você mesmo vai configurar na
[Fase 6](08-fase-6-postgres-e-redis.md), e a fase 1 fica mais arriscada.

### 0.2 — Primeiro acesso e inventário

```bash
# 💻 local (PowerShell ou Git Bash)
ssh root@SEU_IP
```

Rode o bloco abaixo inteiro e **salve a saída num arquivo local**. Você vai consultá-la
várias vezes ao longo das próximas fases.

```bash
# 🖥️ servidor
echo "===== SISTEMA ====="
cat /etc/os-release | head -3
uname -a
echo
echo "===== VIRTUALIZACAO ====="
systemd-detect-virt || echo "systemd-detect-virt indisponivel"
echo
echo "===== CPU / RAM ====="
nproc
free -h
echo
echo "===== DISCO ====="
df -h /
echo
echo "===== PORTAS EM USO ====="
ss -tulpn
echo
echo "===== SERVICOS ATIVOS ====="
systemctl list-units --type=service --state=running --no-pager
echo
echo "===== IPv6 ATIVO? ====="
ip -6 addr show scope global || echo "sem IPv6 global"
```

### 0.3 — Interpretar o resultado

**Virtualização** (`systemd-detect-virt`):

| Saída    | Significado                                                              |
| -------- | ------------------------------------------------------------------------ |
| `kvm`    | ✅ Ideal. Kernel próprio, Docker roda perfeitamente.                      |
| `none`   | ✅ Servidor dedicado. Melhor ainda.                                       |
| `lxc`    | ⚠️ Container. Docker geralmente roda, mas com ressalvas.                 |
| `openvz` | ❌ **Pare.** Docker não é viável. Abra chamado pedindo migração para KVM. |

**RAM** (`free -h`): a coluna `total` vai mostrar algo entre 3.7Gi e 3.9Gi para um plano
de 4GB. Isso é normal — o kernel reserva parte. Se mostrar significativamente menos,
questione o suporte.

**Disco** (`df -h /`): você precisa de pelo menos 20GB livres. Imagens Docker, volumes
de PostgreSQL/Redis e backups temporários crescem. Anote o número inicial: monitorar
disco é um dos alertas da fase 8.

**Portas em uso** (`ss -tulpn`): é aqui que aparecem as surpresas. Anote **tudo** que
está escutando em `0.0.0.0` ou `*`. Suspeitos comuns numa imagem HostGator:

| Porta       | Provável serviço   | O que fazer                         |     |
| ----------- | ------------------ | ----------------------------------- | --- |
| 22          | `sshd`             | Manter (é seu acesso)               |     |
| 25, 587     | `postfix`/`exim`   | Desabilitar se não usar e-mail      |     |
| 80, 443     | `apache2`/`nginx`  | **Precisa sair** — Traefik vai usar |     |
| 3306        | `mysqld`           | Desabilitar se não usar             |     |
| 53          | `systemd-resolved` | Normal se em `127.0.0.53`           |     |
| 6443, 10250 | `k3s`              | Sai na limpeza abaixo               |     |

### 0.4 — Remover o k3s

⚠️ Isto apaga o cluster e tudo que roda nele, **incluindo volumes de dados**. Se houver
algo no k3s que você quer manter, exporte antes:

```bash
# 🖥️ servidor — só se houver algo a preservar
kubectl get all --all-namespaces
kubectl exec -n study-apps deploy/postgres -- pg_dumpall -U appuser > /root/backup-k3s.sql
```

Confirmado que não há nada a perder:

```bash
# 🖥️ servidor
/usr/local/bin/k3s-uninstall.sh
```

Esse script é instalado junto com o k3s e faz a limpeza completa: para os serviços,
remove binários, desmonta volumes e limpa as regras de iptables criadas pelo CNI.

Depois, confira o que sobrou:

```bash
# 🖥️ servidor
systemctl list-units | grep -i k3s          # deve vir vazio
ls /etc/rancher /var/lib/rancher 2>/dev/null # deve dar "No such file"
ip link show | grep -E 'cni|flannel'         # deve vir vazio
iptables -L -n | grep -ci kube               # deve ser 0
```

Se sobrarem interfaces `cni0` ou `flannel.1`, um reboot resolve:

```bash
# 🖥️ servidor
reboot
```

### 0.5 — Liberar portas 80 e 443

Se o inventário mostrou Apache ou Nginx ocupando 80/443:

```bash
# 🖥️ servidor
systemctl stop apache2 nginx 2>/dev/null
systemctl disable apache2 nginx 2>/dev/null
```

Não desinstale ainda — desabilitar é reversível, desinstalar não. Se em uma semana tudo
estiver funcionando, aí sim `apt purge`.

### 0.6 — Confirmar o ganho

```bash
# 🖥️ servidor
free -h
ss -tulpn
```

Você deve ver a RAM usada cair para ~250–400MB e as portas 80/443/6443 livres.

---

## Por que não fazer diferente

**"Por que não reinstalar o SO do zero em vez de limpar?"** — Honestamente, é uma opção
legítima e às vezes mais rápida. Reinstalar dá um estado limpo e conhecido, sem resíduos
de configuração que você não sabe que existem. A favor de limpar: você aprende o que
estava lá, e não perde eventual configuração de rede específica da HostGator. **Se o
inventário mostrar um sistema muito bagunçado** — vários serviços desconhecidos, versão
de SO fora de suporte — reinstale. O painel da HostGator tem essa opção, e é o caminho
mais honesto.

**"Por que não manter o k3s e usar os dois?"** — Porque ele consome 600–800MB de
baseline (servidor de API, scheduler, controller-manager, etcd embutido, kubelet). Isso
absorveria quase metade da folga de 1.744 MiB reservada para page cache e picos, sem trazer
benefício num único nó. Com 8GB seria discutível; com 4GB, não é.

**"Por que não pular o diagnóstico e ir direto ao Docker?"** — Você pode, e vai funcionar
em talvez 70% dos casos. Nos outros 30% você descobre o problema num ponto em que já
investiu horas e não sabe qual das dez mudanças causou. O diagnóstico custa 10 minutos.

---

## Como garantir que está certo

Rode esta bateria. Cada item tem a saída esperada:

```bash
# 🖥️ servidor
systemd-detect-virt
```
→ Esperado: `kvm` ou `none`. Qualquer outra coisa exige decisão antes de prosseguir.

```bash
ss -tulpn | grep -E ':(80|443)\s'
```
→ Esperado: **nenhuma linha**. Se aparecer algo, aquele serviço vai brigar com o Traefik.

```bash
systemctl list-units | grep -ci k3s
```
→ Esperado: `0`.

```bash
free -h | awk '/Mem:/ {print $3}'
```
→ Esperado: menos de `450Mi` usados com o sistema ocioso. Se estiver acima de 800Mi com
nada rodando, tem serviço sobrando — investigue com `systemd-cgtop`.

```bash
df -h / | awk 'NR==2 {print $4}'
```
→ Esperado: pelo menos `20G` disponíveis.

**Teste externo de portas** — do seu Windows, confirme o que o mundo enxerga:

```bash
# 💻 local (PowerShell)
Test-NetConnection -ComputerName SEU_IP -Port 80
```
→ Esperado: `TcpTestSucceeded : False` (nada escutando ainda). Repita para 443.

---

## Armadilhas comuns

**`k3s-uninstall.sh: command not found`** — o script fica em `/usr/local/bin/`. Se o k3s
foi instalado como *agent* em vez de *server*, o nome é `k3s-agent-uninstall.sh`. Se
nenhum dos dois existe, o k3s provavelmente nunca foi instalado neste servidor — o que é
ótimo, siga em frente.

**Perder o acesso SSH durante a limpeza** — o `k3s-uninstall.sh` mexe em iptables. Em
casos raros isso derruba a conexão. Mantenha **uma segunda sessão SSH aberta** durante
toda esta fase. Se a primeira cair, a segunda te salva. Essa prática vale ouro na fase 1
também.

**`ss: command not found`** — sistema muito enxuto. `apt install -y iproute2`. Não use
`netstat`: está deprecado e pode não refletir sockets modernos corretamente.

**Descobrir que o disco é pequeno demais depois** — planos VPS de entrada às vezes trazem
20GB totais, dos quais 8GB já estão em uso. Com 12GB livres dá para começar, mas imagens,
volumes e cópias locais de backup consumirão a margem. Reduza retenção local e preserve
somente as imagens necessárias para rollback.

---

## Para estudar

- 🆓 **"How to Read `ss` Output"** — a documentação do `iproute2`, ou `man ss`. Entender
  a diferença entre `LISTEN` em `0.0.0.0`, `127.0.0.1` e `[::]` é fundamental para tudo
  que vem depois. `[::]` é IPv6, e é a pegadinha da fase 1.
- 🆓 **OpenVZ vs KVM** — qualquer comparativo técnico serve; o essencial é entender que
  OpenVZ compartilha kernel e por isso limita containers, módulos e `sysctl`.
- 🆓 **`systemd` essentials** — a série de artigos "systemd for Administrators" de Lennart
  Poettering. Antiga, mas continua sendo a melhor explicação de units e targets.
- 🆓 **Canal TechWorld with Nana (YouTube)** — o vídeo introdutório de Linux para DevOps
  cobre exatamente estes comandos de inventário com boa didática.
