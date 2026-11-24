# ai-memory na VPS: roteiro de instalação

Roteiro em ordem, do zero até os agentes de IA da sua máquina gravando e
consultando a memória em `https://memory.braidapp.site`.
Manifesto: [`ops/production/ai-memory.yaml`](../../ops/production/ai-memory.yaml).
Desenho da VPS (k3s, Traefik, Tunnel, Access): [deploy-k3s.md](./deploy-k3s.md).

Escrito em 2026-11-22 a partir deste repositório, da documentação do ai-memory
(`docs/install.md`, `https-via-proxy.md`, `lifecycle-ops.md`) e do servidor local.
**Nenhum comando daqui foi executado na VPS.** Os passos marcados com "a
confirmar" são os que só a primeira execução prova.

```text
Claude Code (hooks + MCP) ─ HTTPS ─▶ Cloudflare :443 ─ túnel ─▶ Traefik :80 ─▶ ai-memory :49374
na sua máquina                       memory.braidapp.site                     namespace ai-memory
```

É o mesmo caminho de `timeline`, `api` e `auth`: nenhuma porta nova aberta na VPS.

## Onde estamos

| Peça | Estado |
| --- | --- |
| Servidor local | Container `ai-memory`, imagem `latest` de setembro (**versão 2.4.1**), sem token, em `127.0.0.1:49374`. Volume `ai-memory-data`: 494 páginas, 1057 sessões, cerca de 60 mil observações, ~300 MB. Sem provedor de LLM. |
| Cliente local | `ai-memory` **3.5.1** em `/usr/bin`. Hooks do Claude Code em `~/.claude/settings.json` com `--server-url http://127.0.0.1:49374`. MCP HTTP estático em `~/.claude.json`. Só o Claude Code está ligado; Codex e OpenCode não. |
| VPS | k3s com Traefik interno, Cloudflare Tunnel `timeline-vps`, namespaces `braid`, `edge` e `observability`. Não tem ai-memory. |
| Manifesto | `ops/production/ai-memory.yaml`, versão fixa `3.5.1`. Só neste branch. |

O servidor local e o cliente estão em versões diferentes. Por isso a Parte B
atualiza o servidor local para 3.5.1 **antes** do backup: a VPS vai rodar
3.5.1, e restaurar com a mesma versão que gerou o arquivo elimina uma variável.

## Decisões antes de começar

1. **Sem Cloudflare Access em `memory.braidapp.site`.** Hooks e MCP mandam só
   `Authorization: Bearer <token>`. O cliente do ai-memory não envia os
   cabeçalhos de service token do Access. Com o Access na frente, a Cloudflare
   responderia com a tela de login e nenhuma captura chegaria. Ficam como
   barreiras: o token de 64 caracteres, a lista de hosts permitidos e a
   NetworkPolicy. É a mesma escolha que o deploy fez para `api`. O passo A8
   mostra como proteger só o `/web` com Access, se você quiser. É opcional e
   está marcado "a confirmar".
2. **Um token só, de administrador.** Você é o único usuário. O modo
   multiusuário (`docs/users.md` do ai-memory, chaves `aim_` por pessoa) fica
   para quando outra pessoa precisar entrar.
3. **Sem provedor de LLM na primeira subida.** Igual ao local: a captura, a
   busca FTS5 e os embeddings locais (MiniLM) funcionam sem ele. A
   consolidação por LLM pode ser ligada depois (seção "Depois").
4. **Modo por sessão.** Você roda várias sessões do Claude Code ao mesmo tempo
   pelo T3, em projetos diferentes. O manifesto liga
   `AI_MEMORY_AUTO_SCOPE__MODE=per_session`, e a Parte C instala o MCP com
   `--session-aware`. Assim cada sessão escreve no projeto dela.
5. **Migrar a memória local.** O roteiro leva o histórico atual para a VPS
   (Parte B). Se preferir começar vazio, pule a Parte B inteira.

---

## Parte A: o ai-memory no ar na VPS, ainda vazio

Todos os blocos "Servidor" rodam na sua sessão SSH da VPS, depois de:

```bash
source /opt/braid/env.sh
set -eo pipefail
umask 077
echo "$DOMAIN"   # deve imprimir braidapp.site
```

### A1. Conferir a VPS

**Servidor:**

```bash
free -h
df -h /var/lib/rancher
kubectl top node
kubectl describe node | grep -A8 "Allocated resources"
uname -m
grep -n "network-policy" /etc/rancher/k3s/config.yaml || echo "NetworkPolicy ligada (padrão do k3s)"
```

Siga só se:

- houver ao menos **1 GiB de memória livre** fora dos pods atuais (o pod pede
  384 MiB e pode chegar a 1 GiB; localmente ele usa ~215 MiB);
- houver ao menos **10 GiB livres** no disco do `local-path`;
- `uname -m` imprimir `x86_64` (a imagem do ai-memory só é publicada para `linux/amd64`);
- o `grep` não mostrar `disable-network-policy`.

### A2. Gerar o token e guardar no 1Password

**Seu computador:**

```bash
ai-memory generate-auth-token
```

Copie o valor para o Environment **de produção** do 1Password, no campo
`AI_MEMORY_AUTH_TOKEN`, fora de qualquer scope: nenhum app do Braid lê esse
campo. O 1Password é a única fonte do valor. Não o coloque em `.env.local`, no
repositório nem no histórico do shell.

### A3. Levar o manifesto para a VPS

`/opt/braid/src` precisa continuar limpo (o deploy recusa rodar com arquivos
soltos lá). Copie o manifesto para fora dele.

**Seu computador**, na raiz do repositório (troque usuário, host e porta pelos
do seu SSH):

```bash
scp -P <porta> ops/production/ai-memory.yaml <usuario>@<host>:
```

**Servidor:**

```bash
sudo install -m 0644 -o root -g root ~/ai-memory.yaml /opt/braid/k8s/ai-memory.yaml
rm ~/ai-memory.yaml
grep -n "image:\|memory.braidapp.site" /opt/braid/k8s/ai-memory.yaml
```

Esperado: a imagem `docker.io/akitaonrails/ai-memory:3.5.1` e o hostname em
dois lugares (`AI_MEMORY_ALLOWED_HOSTS` e o Ingress).

### A4. Criar o namespace e o Secret

**Servidor:**

```bash
awk '/^---$/{exit} {print}' /opt/braid/k8s/ai-memory.yaml | kubectl apply -f -   # só o Namespace

read -rsp "AI_MEMORY_AUTH_TOKEN: " V1; echo
test "${#V1}" -ge 32 || echo "TOKEN CURTO DEMAIS"
kubectl -n ai-memory create secret generic ai-memory-env \
  --from-literal=AI_MEMORY_AUTH_TOKEN="$V1" \
  --dry-run=client -o yaml | kubectl apply -f -
unset V1
kubectl -n ai-memory get secret ai-memory-env -o jsonpath='{.data}' | jq 'keys'
```

Esperado: `namespace/ai-memory created`, `secret/ai-memory-env created` e
`["AI_MEMORY_AUTH_TOKEN"]`.

Inclua o Secret no backup da VPS: em `ops/production/backup.sh`, ao lado da
linha do `cloudflared-token`, acrescente
`kubectl -n ai-memory get secrets ai-memory-env -o yaml > "$DEST/ai-memory-secret.yaml"`
e o arquivo na lista do `tar`. Isso é uma mudança de código: entra por PR,
como o resto de `ops/production`.

### A5. Subir o servidor

**Servidor:**

```bash
kubectl apply -f /opt/braid/k8s/ai-memory.yaml
kubectl -n ai-memory rollout status deployment/ai-memory --timeout=300s
kubectl -n ai-memory get pod,pvc,svc,ingress
kubectl -n ai-memory logs deploy/ai-memory --tail=40
```

Esperado: pod `1/1 Running`, PVC `Bound` e, nos logs, `auth=true` e
`mode=PerSession` na linha de isolamento.

- `Pending`: `kubectl -n ai-memory describe pod -l app=ai-memory` (memória ou volume).
- `CrashLoopBackOff` com permissão negada em `/data`: o `fsGroup: 1000` não
  ajustou o dono do volume do `local-path`. Anote o erro e pare aqui (a confirmar).
- Sondas falhando com 403: o filtro de hosts recusou o `Host: localhost` das
  sondas. Confira se `localhost` está em `AI_MEMORY_ALLOWED_HOSTS`.

### A6. Testar pelo Traefik, antes da Cloudflare

**Servidor:**

```bash
TRAEFIK_IP=$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
# Nome por extenso, igual ao manifesto: com $DOMAIN vazio o Traefik responde 404.
H="Host: memory.braidapp.site"
kubectl -n ai-memory get endpointslice -l kubernetes.io/service-name=ai-memory   # precisa listar um endereço

# 1) Saúde: deve imprimir {"status":"ok"}.
curl -fsS -H "$H" "http://$TRAEFIK_IP/healthz"; echo

# 2) Sem token: deve imprimir 401.
curl -sS -o /dev/null -w 'sem token=%{http_code}\n' -H "$H" "http://$TRAEFIK_IP/handoff"

# 3) Com token: deve imprimir 200.
#    O header vai por stdin (-H @-) para o token não aparecer na lista de processos.
printf 'Authorization: Bearer %s\n' \
    "$(kubectl -n ai-memory get secret ai-memory-env -o jsonpath='{.data.AI_MEMORY_AUTH_TOKEN}' | base64 -d)" \
  | curl -sS -o /dev/null -w 'com token=%{http_code}\n' -H "$H" -H @- "http://$TRAEFIK_IP/handoff"

# 4) Outro pod do cluster NÃO alcança: deve imprimir 'bloqueado' depois de 5 s.
kubectl -n braid exec deploy/web -- node -e \
  "fetch('http://ai-memory.ai-memory.svc.cluster.local:49374/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>console.log('ALCANCOU',r.status)).catch(()=>console.log('bloqueado'))"

# 5) Nada escuta no host.
sudo ss -ltn | grep 49374 || echo "49374 não exposta no host"
```

**404 nos itens 1 a 3** vem do Traefik, não do ai-memory: nenhuma rota casou.
As causas são o `Host` errado ou o Service sem pod pronto, já que o Traefik só
cria a rota quando há endereço. Para testar sem o Traefik, use
`kubectl -n ai-memory port-forward svc/ai-memory 49374:49374` e
`curl http://127.0.0.1:49374/healthz` noutro terminal.

Se o item 4 imprimir `ALCANCOU`, pare e corrija a NetworkPolicy. Os rótulos do
Traefik do k3s são a confirmar: se o item 1 falhar com timeout, veja
`kubectl -n kube-system get pod -l app.kubernetes.io/name=traefik` e ajuste o
`podSelector` da política.

### A7. Publicar o endereço pelo Tunnel

**Navegador:** no painel Cloudflare, abra o túnel `timeline-vps`,
**Routes → Add route → Published application**, e crie uma rota igual às do
passo 18 do [deploy-k3s.md](./deploy-k3s.md):

| Subdomain | Domain | Type | URL | HTTP Host Header |
| --- | --- | --- | --- | --- |
| `memory` | `braidapp.site` | HTTP | `traefik.kube-system.svc.cluster.local:80` | `memory.braidapp.site` |

Path vazio, sem `No TLS Verify`, sem curinga. Não aponte a rota direto para o
Service do ai-memory: a NetworkPolicy só aceita o Traefik.

**Seu computador:**

```bash
curl -fsS https://memory.braidapp.site/healthz; echo
curl -sS -o /dev/null -w '%{http_code}\n' https://memory.braidapp.site/handoff
dig +short memory.braidapp.site
```

Esperado: `{"status":"ok"}`, `401` e IPs da Cloudflare, não o da VPS.

### A8. (Opcional) Access só no `/web`

O `/web` é a interface de leitura no navegador. Para que ninguém nem veja a
tela de login dele, crie no Zero Trust uma aplicação **Self-hosted**
`ai-memory web` com hostname `memory.braidapp.site` e **path `web`**, policy
`Allow` só com o seu e-mail e One-time PIN, como no passo 16 do deploy.

A confirmar: se o `/web` buscar dados em caminhos fora de `/web`, ele não vai
carregar atrás do Access, e você terá de remover a aplicação. Depois de criar,
confira as duas coisas:

```bash
curl -sS -o /dev/null -w 'web=%{http_code}\n' https://memory.braidapp.site/web      # 302 para o Access
curl -sS -o /dev/null -w 'handoff=%{http_code}\n' https://memory.braidapp.site/handoff  # continua 401
```

Se `handoff` deixar de ser 401, o Access cobriu mais do que devia: corrija o
path antes de seguir, senão os hooks param de gravar.

**Fim da Parte A.** O servidor está no ar, vazio, e só responde com o token.

---

## Parte B: levar a memória local para a VPS

Pule esta parte se decidiu começar vazio.

### B1. Atualizar o servidor local para 3.5.1

**Seu computador.** Primeiro uma cópia de segurança com a versão atual. O
backup roda com o servidor ligado (usa a API de backup online do SQLite):

```bash
mkdir -p ~/ai-memory-backups
docker exec ai-memory /usr/local/bin/ai-memory backup --to /data/pre-upgrade.tar.gz
docker cp ai-memory:/data/pre-upgrade.tar.gz ~/ai-memory-backups/pre-upgrade-2.4.1.tar.gz
docker exec ai-memory rm /data/pre-upgrade.tar.gz
```

Depois, troque a imagem mantendo o volume e os parâmetros de hoje:

```bash
docker pull docker.io/akitaonrails/ai-memory:3.5.1
docker stop ai-memory && docker rename ai-memory ai-memory-2.4.1
docker run -d --name ai-memory --restart unless-stopped \
  -p 127.0.0.1:49374:49374 \
  -v ai-memory-data:/data \
  docker.io/akitaonrails/ai-memory:3.5.1
docker logs --tail 40 ai-memory
ai-memory status
```

Esperado: `ai-memory 3.5.1 (server)` e as mesmas contagens de antes (494
páginas, 1057 sessões, com algumas a mais se você trabalhou nesse meio tempo).
A primeira subida roda as migrações do banco; leve em conta alguns minutos.

Se der errado: `docker rm -f ai-memory && docker rename ai-memory-2.4.1 ai-memory && docker start ai-memory`.
Se o volume já tiver sido migrado, restaure antes o `pre-upgrade-2.4.1.tar.gz`
com a imagem 2.4.1 (mesmo procedimento do B4, localmente).

Use o Claude Code normalmente por um dia antes de seguir. Quando estiver
estável, apague o container antigo: `docker rm ai-memory-2.4.1`.

### B2. Fechar as sessões e gerar o backup final

A partir daqui, o que for capturado no servidor local depois do backup não vai
para a VPS. Feche **todas** as sessões de IA (Claude Code no terminal e as
threads do T3) antes de seguir, e só reabra no fim da Parte C.

**Seu computador:**

```bash
ai-memory status | grep -A3 spool   # pending deve ser 0
docker exec ai-memory /usr/local/bin/ai-memory backup --to /data/to-vps.tar.gz
docker cp ai-memory:/data/to-vps.tar.gz ~/ai-memory-backups/to-vps-3.5.1.tar.gz
docker exec ai-memory rm /data/to-vps.tar.gz
docker stop ai-memory
sha256sum ~/ai-memory-backups/to-vps-3.5.1.tar.gz
ls -lh ~/ai-memory-backups/to-vps-3.5.1.tar.gz
```

O container fica **parado, não apagado**: é a sua reversão (seção "Parar e
desfazer"). O arquivo tem o wiki, o banco e o `config.toml` do data dir. Ficam
de fora, por desenho, os logs e os modelos (o servidor baixa o MiniLM de novo)
e as credenciais (o local não tem nenhuma).

### B3. Copiar o arquivo para a VPS

**Seu computador:**

```bash
scp -P <porta> ~/ai-memory-backups/to-vps-3.5.1.tar.gz <usuario>@<host>:
```

**Servidor:**

```bash
sha256sum ~/to-vps-3.5.1.tar.gz   # igual ao do seu computador
```

### B4. Restaurar no volume da VPS

O `restore` exige o servidor parado e se recusa a rodar se encontrar outro
processo `ai-memory` vivo. Por isso o servidor sai do ar e um pod descartável,
com o mesmo volume, faz a restauração.

**Servidor:**

```bash
kubectl -n ai-memory scale deployment/ai-memory --replicas=0
kubectl -n ai-memory wait --for=delete pod -l app=ai-memory --timeout=120s || true   # "no matching resources" é ok

kubectl -n ai-memory run ai-memory-restore --restart=Never \
  --image=docker.io/akitaonrails/ai-memory:3.5.1 \
  --overrides='{"spec":{"securityContext":{"runAsUser":1000,"runAsGroup":1000,"fsGroup":1000},"containers":[{"name":"ai-memory-restore","image":"docker.io/akitaonrails/ai-memory:3.5.1","command":["sleep","3600"],"volumeMounts":[{"name":"data","mountPath":"/data"},{"name":"import","mountPath":"/import"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"ai-memory-data"}},{"name":"import","emptyDir":{}}]}}'
kubectl -n ai-memory wait --for=condition=Ready pod/ai-memory-restore --timeout=120s

kubectl -n ai-memory cp ~/to-vps-3.5.1.tar.gz ai-memory-restore:/import/backup.tar.gz
kubectl -n ai-memory exec ai-memory-restore -- \
  /usr/local/bin/ai-memory restore --from /import/backup.tar.gz --data-dir /data --force
kubectl -n ai-memory exec ai-memory-restore -- ls -la /data
kubectl -n ai-memory delete pod ai-memory-restore
```

A confirmar na primeira execução: que a imagem tem `sleep` e `tar` (o
`kubectl cp` usa o `tar` de dentro do container). Se faltar, o `kubectl cp`
avisa; nesse caso, me chame antes de improvisar.

O resumo do `restore` diz onde foi parar o `config.toml` do backup. Com o data
dir vazio, ele é instalado direto. O do local não tem segredos nem comandos,
mas confira:

```bash
kubectl -n ai-memory scale deployment/ai-memory --replicas=1
kubectl -n ai-memory rollout status deployment/ai-memory --timeout=300s
kubectl -n ai-memory exec deploy/ai-memory -- sh -c 'cat /data/config.toml 2>/dev/null || echo "sem config.toml"'
rm ~/to-vps-3.5.1.tar.gz
```

### B5. Conferir as contagens

**Servidor:**

```bash
kubectl -n ai-memory exec deploy/ai-memory -- /usr/local/bin/ai-memory status
```

Esperado: as mesmas páginas, sessões e observações do `ai-memory status` local
do passo B2, e `wiki format: OKF`. Os embeddings podem aparecer como
pendentes por alguns minutos enquanto o modelo é baixado.

---

## Parte C: apontar a sua máquina para a VPS

### C1. Religar hooks e MCP com o endereço novo

**Seu computador.** O token vem do 1Password direto para os comandos, sem
passar pelo histórico do shell. `install-hooks` guarda o token em
`~/.local/share/ai-memory/auth-token` (dono só você), e o MCP
`--session-aware` lê a chave de lá. Por isso `~/.claude.json` não recebe o
token.

```bash
read -rsp "AI_MEMORY_AUTH_TOKEN: " AIM_TOKEN; echo
export AI_MEMORY_SERVER_URL=https://memory.braidapp.site

ai-memory install-hooks --agent claude-code --apply \
  --server-url "$AI_MEMORY_SERVER_URL" --auth-token "$AIM_TOKEN"
ai-memory install-mcp --client claude-code --session-aware --apply \
  --server-url "$AI_MEMORY_SERVER_URL"
unset AIM_TOKEN
```

Os hooks e o MCP guardam o endereço nos próprios comandos. Já os comandos que
você digita (`ai-memory status`, `backup`…) leem `AI_MEMORY_SERVER_URL`. Como
o endereço não é segredo, deixe-o no seu `~/.bashrc`:

```bash
echo 'export AI_MEMORY_SERVER_URL=https://memory.braidapp.site' >> ~/.bashrc
```

A confirmar: se esses comandos acham o token sozinhos em
`~/.local/share/ai-memory/auth-token`. Se `ai-memory status` responder `401`,
passe `--auth-token` nele só para a conferência.

### C2. Conferir

```bash
grep -c "memory.braidapp.site" ~/.claude/settings.json   # um por hook (9 hoje)
grep -c "127.0.0.1:49374" ~/.claude/settings.json        # 0
grep -n -A6 '"ai-memory"' ~/.claude.json                 # comando stdio, sem token
AI_MEMORY_SERVER_URL=https://memory.braidapp.site ai-memory status
```

Depois abra uma sessão nova do Claude Code neste repositório e peça
`memory_status` e uma busca qualquer, por exemplo "hermes vps". Ao fim da
sessão, `ai-memory status` na VPS deve mostrar a contagem de sessões subindo.

Se aparecer `403 forbidden host`, o hostname não está em
`AI_MEMORY_ALLOWED_HOSTS`. Se aparecer `401`, o token do cliente é diferente
do Secret.

### C3. Outras ferramentas e máquinas

O mesmo par de comandos liga qualquer outro agente ao mesmo servidor, por
exemplo `--agent codex` e `--client codex`. Numa segunda máquina, instale o
cliente (`mise use -g github:akitaonrails/ai-memory`) e repita o C1. Todas
gravam na mesma memória, e é isso que deixa uma sessão continuar o trabalho de
outra.

**Fim da Parte C.** Reabra as sessões. Deixe o container local parado por uma
semana como reversão e só então apague-o (seção "Parar e desfazer").

---

## Parte D: backup e atualização

### D1. Backup cifrado do volume

O `backup.sh` da VPS ainda não inclui o ai-memory. Até incluir, faça à mão,
semanalmente e antes de toda atualização:

**Servidor:**

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
kubectl -n ai-memory exec deploy/ai-memory -- /usr/local/bin/ai-memory backup --to /data/snap.tar.gz
kubectl -n ai-memory exec deploy/ai-memory -- cat /data/snap.tar.gz \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass file:/opt/braid/private/backup-passphrase \
      -out "/opt/braid/backups/ai-memory-$STAMP.tgz.enc"
kubectl -n ai-memory exec deploy/ai-memory -- rm /data/snap.tar.gz
ls -lh /opt/braid/backups/ai-memory-*.enc
```

Diferente da cópia do Hermes, este backup é consistente: o `ai-memory backup`
usa a API de backup online do SQLite. Copie o arquivo para fora da VPS como os
demais. Para automatizar, o bloco acima entra no `backup.sh` por PR.

### D2. Atualizar a versão

A tag é fixa de propósito: uma versão nova pode migrar o banco, e não há volta
sem backup.

```bash
# 1) Backup (D1).
# 2) Troque a tag e aplique:
sudo sed -i 's#ai-memory:3\.5\.1#ai-memory:<nova>#' /opt/braid/k8s/ai-memory.yaml
kubectl apply -f /opt/braid/k8s/ai-memory.yaml
kubectl -n ai-memory rollout status deployment/ai-memory --timeout=600s
kubectl -n ai-memory exec deploy/ai-memory -- /usr/local/bin/ai-memory status
```

Atualize o cliente da sua máquina para a mesma versão (`ai-memory upgrade`) e
a tag em `ops/production/ai-memory.yaml` no repositório.

---

## Parte E: ligar o LLM (Anthropic, Claude Haiku 5.5)

Sem LLM, o ai-memory só captura e busca. Com ele, consolida as sessões em
páginas do wiki. O manifesto já declara `AI_MEMORY_LLM_PROVIDER=anthropic` e
`AI_MEMORY_LLM_MODEL=claude-haiku-5-5`; falta só a chave. A versão 3.5.1 já
trata o Haiku 5.5 como modelo atual (corrigido na #1180 do ai-memory).

Não use `anthropic-oauth` (token da assinatura Claude): a Anthropic recusa
esses tokens em apps de terceiros, e todo pedido volta `429`.

### E1. Criar a chave e guardar no 1Password

**Navegador:** em `console.anthropic.com`, **API keys → Create key**, com um
nome como `ai-memory-vps`. Use uma chave só para o ai-memory, separada da do
`api`, para poder revogar e acompanhar o gasto à parte.

Guarde o valor no Environment **de produção** do 1Password, no campo
`AI_MEMORY_ANTHROPIC_API_KEY`, fora de qualquer scope.

### E2. Acrescentar a chave ao Secret

**Servidor.** O `patch` acrescenta a chave sem mexer no token. O JSON vai por
stdin, e o `printf` é builtin do shell, então a chave não aparece na lista de
processos.

```bash
read -rsp "AI_MEMORY_ANTHROPIC_API_KEY: " V1; echo
case "$V1" in sk-ant-api*) ;; *) echo "NÃO PARECE UMA CHAVE DE API DA ANTHROPIC";; esac
printf '{"stringData":{"ANTHROPIC_API_KEY":"%s"}}' "$V1" \
  | kubectl -n ai-memory patch secret ai-memory-env --type merge --patch-file /dev/stdin
unset V1
kubectl -n ai-memory get secret ai-memory-env -o jsonpath='{.data}' | jq 'keys'
```

Esperado: `["AI_MEMORY_AUTH_TOKEN","ANTHROPIC_API_KEY"]`.

### E3. Aplicar o manifesto novo

**Seu computador**, na raiz do repositório, depois do merge:

```bash
scp -P <porta> ops/production/ai-memory.yaml <usuario>@<host>:
```

**Servidor:**

```bash
sudo install -m 0644 -o root -g root ~/ai-memory.yaml /opt/braid/k8s/ai-memory.yaml
rm ~/ai-memory.yaml
grep -n "AI_MEMORY_LLM" /opt/braid/k8s/ai-memory.yaml
kubectl apply -f /opt/braid/k8s/ai-memory.yaml
kubectl -n ai-memory rollout status deployment/ai-memory --timeout=300s
```

O `apply` muda o template do pod e já provoca a troca (estratégia
`Recreate`: alguns segundos fora do ar; os hooks guardam as capturas no spool
e reenviam). Se só o Secret tivesse mudado, seria preciso
`kubectl -n ai-memory rollout restart deployment/ai-memory`.

### E4. Conferir

**Servidor:**

```bash
kubectl -n ai-memory logs deploy/ai-memory --tail=60 | grep -i -E "llm|provider|anthropic"
kubectl -n ai-memory exec deploy/ai-memory -- /usr/local/bin/ai-memory llm-test --server
```

Esperado: uma linha `server provider: anthropic / claude-haiku-5-5 (… ms)`.
O `--server` testa o que o servidor tem configurado, com a chave dele; um
`llm-test` rodado na sua máquina falharia, porque a chave não está lá.

- `401` ou `authentication_error`: chave errada ou revogada. Refaça o E2.
- `400` falando de modelo: confira `AI_MEMORY_LLM_MODEL` no manifesto aplicado.
- `400` com `credit balance`: falta crédito na conta da Console.

A primeira consolidação acontece nas sessões que terminarem depois disso.
Para consolidar o que já existe, use `memory_consolidate` por MCP numa sessão
do Claude Code.

**Desligar:** tire as duas linhas `AI_MEMORY_LLM_*` do manifesto e reaplique.
A chave pode ficar no Secret.

---

## Depois

- **Consolidação por LLM.** Ver a Parte E.
- **Hermes gravando na mesma memória.** O ai-memory tem hooks para o Hermes
  (`install-hooks --agent hermes` imprime o bloco do `config.yaml`). Pela rede
  interna, exige três mudanças: `ai-memory.ai-memory.svc.cluster.local` em
  `AI_MEMORY_ALLOWED_HOSTS`, uma regra na NetworkPolicy para o pod `hermes` do
  namespace `braid` e o binário do ai-memory dentro do pod do Hermes. Cada
  uma pede decisão própria; não faça junto deste roteiro.
- **Programar na VPS.** Uma sessão de agente rodando na própria VPS usa o
  mesmo C1 com o endereço público.

## O que ainda não está coberto

- **Backup automático** do volume e do Secret (D1 e A4 são manuais até o PR no `backup.sh`).
- **Alerta** quando o pod cair. Os hooks guardam as capturas no spool local
  (`~/.local/share/ai-memory/hook-spool`) e reenviam depois. A confirmar
  quanto tempo e quanto volume o spool aguenta.
- **Limite da Cloudflare.** Pedidos pelo proxy da Cloudflare têm limite de
  ~100 s sem resposta. Uma conexão longa do MCP pode cair e reconectar. A
  confirmar no uso; se incomodar, é ajuste de cliente, não da VPS.
- **Saída de rede do pod sem restrição**, como no Hermes: a NetworkPolicy só limita quem entra.

## Parar e desfazer

| Preciso de | Comando |
| --- | --- |
| Voltar a usar o servidor local | `docker start ai-memory`, depois o C1 com `--server-url http://127.0.0.1:49374`, sem `--auth-token` e sem `--session-aware` |
| Parar o ai-memory da VPS mantendo os dados | `kubectl -n ai-memory scale deployment/ai-memory --replicas=0` |
| Voltar a subir | `kubectl -n ai-memory scale deployment/ai-memory --replicas=1` |
| Trocar o token | novo valor no 1Password, recrie o Secret (A4), `kubectl -n ai-memory rollout restart deployment/ai-memory` e repita o C1 em cada máquina |
| Tirar do ar público | apague a rota `memory` do túnel no painel Cloudflare |
| Apagar o servidor local, depois de uma semana estável | `docker rm ai-memory` (o volume `ai-memory-data` fica até `docker volume rm ai-memory-data`) |
| Remover tudo da VPS, **apagando a memória** | `kubectl delete -f /opt/braid/k8s/ai-memory.yaml` (apaga também o volume e o namespace; irreversível) |

Não use `kubectl delete -f` para "reiniciar": o manifesto inclui o volume.
