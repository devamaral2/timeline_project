# 11 — Checklist de segurança

Documento transversal. Cada item tem **onde é implementado**, **por que importa** e **um
comando de verificação**. Use como auditoria: rode a coluna de verificação uma vez por
mês.

Os itens marcados 🔴 são bloqueantes — não coloque dado real nem exponha a aplicação
publicamente sem eles.

---

## Parte 1 — Os fundamentos que você já tinha em mente

### 🔴 1.1 Nenhuma porta além de 22, 80 e 443 exposta

**Onde:** [Fase 1](03-fase-1-hardening-do-so.md) (UFW) + [Fase 2](04-fase-2-docker.md)
(Docker).

**Por quê:** cada porta aberta é uma superfície. Postgres e Redis expostos são encontrados
por scanners automatizados em horas.

```bash
# 🖥️ servidor
ss -tulpn | grep -E '0\.0\.0\.0|\[::\]'
```
→ Esperado: apenas 22, 80, 443.

### 🔴 1.2 O Docker não fura o firewall

**Onde:** [Fase 2](04-fase-2-docker.md), seção 2.3.

**Por quê:** `ports:` insere regras de NAT que são avaliadas **antes** do UFW. O firewall
diz "deny" enquanto a porta responde. É a falha mais comum e mais silenciosa em VPS com
Docker.

```bash
# 🖥️ servidor
sudo iptables -L DOCKER-USER -n --line-numbers
grep -rn "ports:" /opt/stack/*/docker-compose.yml
```
→ Esperado: a chain `DOCKER-USER` termina com `DROP`; apenas o Traefik declara `ports:`
sem prefixo `127.0.0.1`.

### 🔴 1.3 SSH apenas por chave, sem root

**Onde:** [Fase 1](03-fase-1-hardening-do-so.md), seção 1.3.

```bash
# 💻 local
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no deploy@SEU_IP
```
→ Esperado: `Permission denied (publickey)`.

### 🔴 1.4 TLS em tudo, com HSTS

**Onde:** [Fase 5](07-fase-5-traefik-e-tls.md).

```bash
# 💻 local
curl -sI http://SEU_DOMINIO | grep -i location
curl -sI https://SEU_DOMINIO | grep -i strict-transport
```
→ Esperado: 301 para HTTPS; header `Strict-Transport-Security` presente.

Complemente com o teste do SSL Labs (ssllabs.com/ssltest) — mire em A ou A+.

### 🔴 1.5 Segredos fora do git

**Onde:** [Fase 3](05-fase-3-monorepo-local.md) (`.gitignore`) +
[Fase 6](08-fase-6-postgres-e-redis.md) (`.env` com `chmod 600`).

**Por quê:** git guarda para sempre. Um segredo commitado e depois removido continua no
histórico, e em repositório público é indexado por bots em minutos.

```bash
# 💻 local
git log --all --full-history -- "*.env" "*.pem" "*.key"
```
→ Esperado: nenhum resultado.

```bash
# 🖥️ servidor
find /opt/stack -name ".env" -exec stat -c "%a %n" {} \;
```
→ Esperado: `600` em todos.

**Se você já commitou um segredo:** trocar o valor é obrigatório. Reescrever o histórico
(`git filter-repo`) ajuda, mas assuma que o segredo vazou.

### 🔴 1.6 Containers como usuário não-root

**Onde:** [Fase 4](06-fase-4-imagens-docker.md) (`USER node`).

```bash
# 🖥️ servidor
for c in $(docker ps --format '{{.Names}}'); do
  echo "$c: $(docker exec "$c" id -u 2>/dev/null || echo '?')"
done
```
→ Esperado: `1000` ou outro não-zero em `web` e `api`. Imagens de infraestrutura podem
usar usuários próprios ou root quando o acesso ao host é requisito documentado; Alloy é
a exceção sensível e deve migrar para socket proxy quando a stack estabilizar.

### 🔴 1.7 Todo container com `mem_limit`

**Onde:** [Fase 2](04-fase-2-docker.md), seção 2.6.

**Por quê:** sem limite, um vazamento de memória aciona o OOM killer, que escolhe a vítima
por heurística — frequentemente o Postgres.

```bash
# 🖥️ servidor
docker ps -q | xargs docker inspect --format '{{.Name}}: {{.HostConfig.Memory}}'
```
→ Esperado: nenhum valor `0`.

### 🔴 1.8 Redis com senha e comandos perigosos desabilitados

**Onde:** [Fase 6](08-fase-6-postgres-e-redis.md).

```bash
# 🖥️ servidor
docker exec redis redis-cli ping
```
→ Esperado: `NOAUTH Authentication required.`

### 1.9 Usuário de aplicação sem privilégios administrativos no Postgres

**Onde:** [Fase 6](08-fase-6-postgres-e-redis.md), seção 6.4.

```bash
# 🖥️ servidor
docker exec postgres psql -U timeline_admin -d timeline -c "\du timeline_app"
```
→ Esperado: sem `Superuser`, sem `Create DB`.

### 1.10 Rate limiting ativo

**Onde:** [Fase 5](07-fase-5-traefik-e-tls.md) (Traefik) +
[Fase 1](03-fase-1-hardening-do-so.md) (fail2ban).

```bash
# 🖥️ servidor
for i in $(seq 1 200); do curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/ -H "Host: app.SEUDOMINIO.com"; done | sort | uniq -c
```
→ Esperado: alguns `429`.

### 1.11 Validação de entrada na aplicação

**Onde:** DTOs e pipes do Nest em `apps/api`; a [Fase 3](05-fase-3-monorepo-local.md)
mantém esse requisito nos novos endpoints operacionais.

Toda fronteira — body, query, params, headers, variáveis de ambiente — validada. Nunca
confie em `req.body` sem schema.

### 1.12 Dashboards internos nunca sem autenticação

**Onde:** [Fase 5](07-fase-5-traefik-e-tls.md) (`api.insecure: false`) +
[Fase 8](10-fase-8-observabilidade.md) (Grafana hospedado; Alloy sem porta pública).

```bash
# 💻 local
curl -sI http://SEU_IP:8080/dashboard/
curl -sI http://SEU_IP:12345
```
→ Esperado: conexão recusada nas duas. O Grafana Cloud usa autenticação do provedor e
não cria um domínio Grafana no VPS.

---

## Parte 2 — Os pontos que faltavam

Estes não estavam na sua lista inicial e são, em vários casos, mais importantes que os
anteriores.

### 🔴 2.1 Backup off-site com restore testado

**Onde:** [Fase 6](08-fase-6-postgres-e-redis.md), seções 6.5 e 6.6.

**Por quê:** é a lacuna número um. O snapshot da HostGator está na mesma conta e na mesma
infraestrutura — se a conta for comprometida, suspensa por engano, ou se houver falha do
lado deles, você perde servidor e backup juntos. E backup que nunca foi restaurado não é
backup: é um arquivo que você espera que funcione.

```bash
# 🖥️ servidor
rclone ls b2:seu-bucket-backup/$(date +%Y/%m)/ | tail -5
```
→ Esperado: arquivos recentes, com tamanho plausível.

**Data do último teste de restauração:** `____________`
Repita a cada 3 meses. Credenciais expiram, scripts quebram silenciosamente.

### 2.2 Cloudflare na frente do domínio

**Onde:** etapa opcional posterior à [Fase 5](07-fase-5-traefik-e-tls.md).

**Por quê:** sem isso, seu IP real é público — está no DNS, nos headers, nos logs de
qualquer serviço que você chamar. Com o IP, um atacante ignora qualquer proteção
associada ao domínio e vai direto ao servidor. Um VPS de 4GB cai com um ataque de negação
de serviço modesto; a rede do Cloudflare absorve. É gratuito.

```bash
# 💻 local
nslookup SEU_DOMINIO
```
→ Esperado: um IP do Cloudflare, não o do seu VPS.

⚠️ Com o Cloudflare ativo, configure `forwardedHeaders.trustedIPs` no Traefik, senão o
rate limit passa a contar todos os visitantes como um único IP.

### 🔴 2.3 Chave SSH do CI restrita

**Onde:** [Fase 7](09-fase-7-cicd-github-actions.md), seção 7.2.

**Por quê:** a chave nos secrets do GitHub é a credencial mais poderosa do seu setup. Se
a conta do GitHub for comprometida, ou se uma Action de terceiro maliciosa ler os secrets,
essa chave dá acesso ao servidor. Amarrá-la a um único comando reduz o estrago a
"redeployar sua aplicação".

```bash
# 💻 local
ssh -i chave_do_ci ci@SEU_IP "cat /etc/passwd"
```
→ Esperado: o comando é ignorado; o script de deploy roda. **Nunca** o conteúdo do
arquivo.

### 2.4 Scan de imagem e atualização de dependências

**Onde:** [Fase 7](09-fase-7-cicd-github-actions.md) (Trivy) + Dependabot.

**Por quê:** `node:24-alpine` acumula CVEs entre releases. Uma imagem construída há três
meses provavelmente tem vulnerabilidades conhecidas. Sem automação, ninguém lembra de
atualizar.

Crie `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: docker
    directory: "/apps/web"
    schedule: { interval: weekly }
  - package-ecosystem: docker
    directory: "/apps/api"
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: monthly }
```

O ecossistema `github-actions` é o mais esquecido e um dos mais importantes: Actions
desatualizadas são vetor conhecido de ataque de cadeia de suprimentos.

### 🔴 2.5 Rotação de logs do Docker

**Onde:** [Fase 2](04-fase-2-docker.md), `daemon.json`.

**Por quê:** por padrão o Docker guarda logs sem limite. Uma app em loop de erro escreve
gigabytes em horas. Disco cheio derruba Postgres, Redis e Traefik ao mesmo tempo — e o
sistema fica difícil até de diagnosticar, porque nada consegue escrever. **É a causa nº 1
de queda em VPS pequeno** e custa cinco linhas de configuração.

```bash
# 🖥️ servidor
docker info --format '{{.LoggingDriver}}'
cat /etc/docker/daemon.json | grep -A3 log-opts
du -sh /var/lib/docker/containers/ 2>/dev/null
df -h /
```
→ Esperado: `max-size` configurado; `/var/lib/docker/containers` abaixo de ~500MB.

### 🔴 2.6 Firewall cobrindo IPv6

**Onde:** [Fase 1](03-fase-1-hardening-do-so.md), seção 1.4.

**Por quê:** se o VPS tem IPv6 e o UFW só cobre IPv4, **todos os serviços continuam
alcançáveis** pela internet via IPv6. O `ufw status` mostra "active" e você acredita estar
protegido.

```bash
# 🖥️ servidor
grep IPV6 /etc/default/ufw
sudo ufw status | grep -c v6
ip -6 addr show scope global
```
→ Esperado: `IPV6=yes`; regras `(v6)` presentes. Se o servidor não tem IPv6 global, o
ponto não se aplica.

### 2.7 Gestão de segredos com caminho de evolução

**Onde:** [Fase 6](08-fase-6-postgres-e-redis.md).

Hoje: `.env` com `chmod 600` fora do repositório, `.env.example` versionado. Separe
`api.env`, credenciais de dados e tokens de escrita do Grafana Cloud para reduzir o raio
de exposição e permitir rotação independente.

Limitações honestas desse modelo: os segredos estão em texto claro no disco do servidor;
não há rotação; não há auditoria de quem acessou; se o servidor for restaurado de um
backup antigo, os segredos voltam junto.

**Próximo degrau:** SOPS + age permite versionar os segredos **cifrados** no próprio git.
Você commita `secrets.enc.yaml`, e só quem tem a chave privada decifra. Resolve
versionamento e recuperação sem expor nada. É simples o suficiente para valer a pena
assim que você tiver mais de um servidor.

### 2.8 Variáveis de build viram públicas

**Por quê:** frameworks de frontend embutem certas variáveis no bundle enviado ao
navegador. No Next.js, é o prefixo `NEXT_PUBLIC_`; no Vite, `VITE_`. Uma chave de API
colocada ali está publicada — basta abrir o DevTools.

**Regra:** qualquer variável com prefixo público contém apenas informação que você
imprimiria num outdoor. Chave de API, string de conexão e token de serviço ficam no
backend, sempre.

```bash
# 💻 local — antes de publicar um frontend
grep -rn "NEXT_PUBLIC_\|VITE_" apps/ --include="*.ts" --include="*.tsx"
```
→ Revise cada ocorrência.

### 2.9 Não envie e-mail pelo VPS

**Por quê:** a porta 25 de saída é bloqueada pela maioria dos provedores, e IPs de VPS
compartilham reputação ruim — suas mensagens vão para spam ou simplesmente não chegam.
Pior: um MTA local mal configurado vira relay aberto e faz seu IP ser incluído em listas
de bloqueio, o que pode levar à suspensão da conta.

**Faça:** use Resend, Brevo ou Amazon SES. Configure SPF, DKIM e DMARC no domínio.
**Desabilite** o MTA local (feito na [Fase 0](02-fase-0-diagnostico-e-limpeza.md)).

```bash
# 🖥️ servidor
systemctl is-enabled postfix exim4 2>/dev/null || echo "OK - nenhum MTA habilitado"
```

### 2.10 Detecção de comprometimento

**Por quê:** a pergunta que quase ninguém consegue responder é "como eu saberia se fui
invadido?". Sem uma linha de base, você não sabe.

Auditoria automatizada, mensal:

```bash
# 🖥️ servidor
sudo apt install -y lynis
sudo lynis audit system --quick
```
Anote o **Hardening Index** inicial e acompanhe a evolução.

Verificações rápidas de rotina:

```bash
# 🖥️ servidor
last -20                                    # quem entrou
sudo lastb -20                              # tentativas falhas
cat ~/.ssh/authorized_keys                  # alguma chave que voce nao reconhece?
sudo cat /home/ci/.ssh/authorized_keys
crontab -l; sudo crontab -l                 # cron que voce nao criou?
docker ps                                   # container que voce nao subiu?
ss -tulpn                                   # porta nova escutando?
```

**Sinais de alerta:** processo desconhecido consumindo CPU (mineração é o uso mais comum
de servidores invadidos), tráfego de saída inexplicado, chave SSH que você não reconhece,
arquivo modificado em `/etc` sem motivo.

**Plano de resposta**, na ordem: (1) isole — feche 80/443 no UFW, mantendo o SSH;
(2) preserve — snapshot antes de mexer, porque investigar destrói evidência;
(3) avalie o alcance — quais dados o invasor alcançaria com o que ele controlava;
(4) reconstrua — não "limpe" um servidor comprometido; reinstale do zero e restaure dados
de um backup **anterior** à invasão; (5) rotacione **todos** os segredos: banco, Redis,
GitHub, chaves SSH, tokens.

### 2.11 Socket do Docker exposto ao Traefik

**Onde:** [Fase 5](07-fase-5-traefik-e-tls.md), seção 5.4.

**Por quê:** quem acessa `/var/run/docker.sock` pode criar um container privilegiado
montando `/` do host — root no servidor. A flag `:ro` ajuda pouco, porque a API do Docker
aceita comandos por escrita no socket de qualquer forma.

**Melhoria recomendada:** `tecnativa/docker-socket-proxy`, um intermediário mínimo
(~10MB) que só permite as chamadas de leitura que o Traefik precisa.

```yaml
  socket-proxy:
    image: tecnativa/docker-socket-proxy:0.2
    environment:
      CONTAINERS: 1
      POST: 0            # bloqueia toda escrita
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - socket-proxy
    mem_limit: 32m
```
E no Traefik: `endpoint: "tcp://socket-proxy:2375"`, removendo a montagem do socket.

O mesmo vale para o Alloy na [Fase 8](10-fase-8-observabilidade.md).

### 2.12 LGPD, se houver dados pessoais

Se a aplicação guardar dados de pessoas reais — nome, e-mail, CPF, IP associado a
identidade — a LGPD se aplica. Os pontos práticos: coletar apenas o necessário; ter base
legal para o tratamento; permitir exclusão a pedido; e comunicar incidentes de segurança
relevantes à ANPD e aos titulares.

⚠️ Um detalhe técnico com consequência jurídica: **logs contêm dados pessoais**. IP,
user-agent e e-mail em mensagens de erro são dados pessoais. Configure retenção no
Grafana Cloud de acordo com a necessidade e evite logar corpo, token ou e-mail.

Isto é sinalização, não aconselhamento jurídico. Se o projeto crescer, consulte alguém
qualificado.

### 2.13 Termos da HostGator e limites do plano

Confirme antes de investir tempo:

- **VPS não-gerenciado** significa que o suporte não cobre Docker, sua aplicação, nem
  configuração de SO. Eles garantem que a máquina liga.
- **Política de uso aceitável** — o que você pode hospedar. Mineração é proibida em
  praticamente todo provedor.
- **Existe console de emergência (VNC/KVM)?** Descubra **onde fica antes de precisar** —
  é a única saída se você se trancar para fora.
- **Snapshot está incluído no plano?** Se não, sua recuperação depende só dos seus
  backups.

### 2.14 2FA e proteção de branch no GitHub

**Onde:** [Fase 7](09-fase-7-cicd-github-actions.md).

**Por quê:** o repositório contém a chave SSH do servidor nos secrets. Comprometer a conta
do GitHub é comprometer o servidor. Sem proteção de branch, um push direto em `main`
executa código com aquela chave.

- ✅ 2FA na conta
- ✅ Branch protection em `main`, sem bypass
- ✅ Secret scanning + push protection
- ✅ Actions de terceiros fixadas por tag ou SHA, nunca `@main`

### 2.15 Visibilidade dos pacotes no GHCR

**Onde:** [Fase 7](09-fase-7-cicd-github-actions.md).

**Por quê:** a visibilidade do pacote **não segue** a do repositório. Repositório privado
com imagem pública é uma combinação comum e ninguém avisa. A imagem contém seu código
compilado.

Verifique manualmente em Package settings.

---

## Auditoria mensal — script consolidado

```bash
#!/usr/bin/env bash
# /opt/stack/audit.sh
echo "===== PORTAS EXPOSTAS ====="
ss -tulpn | grep -E '0\.0\.0\.0|\[::\]'

echo -e "\n===== FIREWALL ====="
sudo ufw status verbose | head -20

echo -e "\n===== DOCKER-USER ====="
sudo iptables -L DOCKER-USER -n

echo -e "\n===== CONTAINERS SEM LIMITE DE MEMORIA ====="
docker ps -q | xargs docker inspect \
  --format '{{.Name}} {{.HostConfig.Memory}}' | awk '$2==0 {print $1}'

echo -e "\n===== CONTAINERS RODANDO COMO ROOT ====="
for c in $(docker ps --format '{{.Names}}'); do
  u=$(docker exec "$c" id -u 2>/dev/null || echo "?")
  [ "$u" = "0" ] && echo "$c"
done

echo -e "\n===== DISCO ====="
df -h / | tail -1

echo -e "\n===== BACKUPS RECENTES ====="
ls -lht /opt/stack/backups/ 2>/dev/null | head -4

echo -e "\n===== ACESSOS RECENTES ====="
last -10

echo -e "\n===== TENTATIVAS FALHAS ====="
sudo lastb -5 2>/dev/null | head -6

echo -e "\n===== ATUALIZACOES DE SEGURANCA PENDENTES ====="
apt list --upgradable 2>/dev/null | grep -ci security || echo 0

echo -e "\n===== IMAGENS DESATUALIZADAS ====="
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' | head -10
```

```bash
# 🖥️ servidor
chmod 700 /opt/stack/audit.sh
```

Agende um lembrete mensal para rodar e ler a saída inteira.

---

## Modelo de ameaça — quem é o atacante realista

Vale calibrar. Você não é alvo de um Estado-nação. Os atacantes reais deste servidor são,
em ordem de probabilidade:

**1. Bots automatizados (99% do que você verá).** Varrem faixas de IP procurando SSH com
senha fraca, Redis sem senha, Postgres exposto, painéis administrativos abertos. Não têm
nada contra você — é indiscriminado. **Defesas:** itens 1.1 a 1.8. Isso já elimina
praticamente tudo.

**2. Cadeia de suprimentos.** Uma dependência do npm comprometida, ou uma GitHub Action
maliciosa. É o vetor que mais cresce, porque escala. **Defesas:** 2.4 (Dependabot,
Trivy), 2.14 (Actions fixadas), e as redes internas que limitam o que uma app
comprometida alcança.

**3. Erro próprio.** Estatisticamente, o maior risco. Segredo commitado, porta aberta
"temporariamente", `docker compose down -v` no diretório errado. **Defesas:** 1.5,
push protection, e principalmente 2.1 — backup testado é o que transforma catástrofe em
inconveniente.

**4. Ataque direcionado.** Se você não hospeda algo de valor específico, é improvável.
Se hospedar, o modelo de ameaça muda e esta spec não é suficiente.

A implicação prática: **priorize na ordem acima.** Fechar portas e trocar senhas vale
mais que qualquer configuração sofisticada de SELinux.

---

## Para estudar

- 🆓 **OWASP Top 10** — as dez categorias mais críticas em aplicações web. Releia
  anualmente; muda pouco e sempre rende.
- 🆓 **OWASP Cheat Sheet Series** — fichas práticas por tema (autenticação, cookies, JWT,
  cabeçalhos). É a referência que você consulta enquanto escreve código.
- 🆓 **CIS Benchmarks** (Docker e Ubuntu) — checklists de hardening usados em auditoria
  profissional. Longos; leia por seção conforme a necessidade.
- 🆓 **Google SRE Book, capítulo sobre postmortems** — a cultura de postmortem sem culpado
  é o que transforma incidente em aprendizado.
- 🆓 **Have I Been Pwned** — cadastre seu domínio para ser avisado se credenciais
  associadas a ele vazarem.
- 🆓 **Lynis** — já mencionado; a melhor forma de estudo dirigido é ler cada sugestão que
  ele faz e decidir conscientemente aplicar ou não.
- 💰 **"The Web Application Hacker's Handbook"** — antigo mas ainda a referência para
  entender como aplicações web são atacadas na prática.
- 💰 **"Practical Cryptography for Developers"** (gratuito online também) — para quando
  você precisar guardar senhas, gerar tokens ou assinar dados sem inventar moda.
