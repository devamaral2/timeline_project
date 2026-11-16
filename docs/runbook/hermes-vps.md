# Hermes na VPS: roteiro de instalação

Roteiro em ordem, do zero até o `/hermes` funcionando no chat de produção.
Decisão e motivos: [ADR 004](../../.agents/docs/ai-dialog/adr-004-hermes-automacoes.md).
Setup local e operação do dia a dia: [hermes.md](./hermes.md).

Escrito em 2026-11-15 a partir do repositório e do container local
(`braid-hermes`, Hermes Agent v0.23.0). **Nenhum comando daqui foi executado na
VPS**: os passos marcados com "a confirmar" são os que só a primeira execução prova.

## Onde estamos

| Peça | Estado |
| --- | --- |
| Manifesto, timer e script de atualização do Hermes (`ops/production/hermes*`) | Prontos, mas **só no branch `feat/web-na-api-nova`**. Não estão em `main` nem no GitHub. |
| Servidor MCP (`apps/mcp`), rota `POST /api/requests/hermes`, comando `/hermes` na web | Idem: só nesse branch. |
| Produção (VPS) | Roda o que está em `main`. Não conhece Hermes, MCP nem o escopo `hermes-runtime`. |
| Pasta de skills e agentes em produção (ADR 0005) | **Não montada.** Faltam o volume em `hermes.yaml`, a montagem na API e o backup. |
| Android | Sem o modo Hermes (fora do escopo da ADR 004). |

Consequência: a instalação tem duas partes.

- **Parte A, dá para fazer hoje.** O pod do Hermes sozinho: imagem pública, volume,
  Secret, isolamento de rede, atualização diária com rollback. Não depende de
  nenhum código nosso em produção. Ao fim, o Hermes está no ar e ninguém fala com ele.
- **Parte B, depende de publicar o branch em `main`.** MCP, rota da API e o
  `/hermes` no chat. O branch tem 223 commits à frente de `main` e troca as
  migrations da API por uma única `0000_initial.sql` (banco novo). Publicá-lo é
  uma virada de banco em produção, que **este roteiro não cobre** e que precisa
  de plano próprio antes do merge. Não verifiquei como `pnpm db:migrate` se
  comporta contra o banco atual da VPS.

## Decisões antes de começar

1. **Terminal do Hermes ligado ou desligado em produção.** O gateway usa
   `terminal.backend: local`, sem sandbox: o agente executa comandos dentro do
   pod, onde estão `OPENROUTER_API_KEY`, `API_SERVER_KEY` e `MCP_TOKEN`. A ADR 004
   (pergunta 0) deixou essa decisão em aberto para a VPS. Na Parte A o risco é
   baixo porque nada alcança o Hermes; decida antes da Parte B.
2. **Modelo.** O local usa `deepseek/deepseek-v4.1-flash-1017` pelo OpenRouter.
   O roteiro assume o mesmo.
3. **Memória.** O pod pede 1 GiB e pode chegar a 2 GiB. Confira a folga no passo A1.

---

## Parte A: o Hermes no ar, isolado

Todos os blocos "Servidor" rodam na sua sessão SSH da VPS, depois de:

```bash
source /opt/braid/env.sh
set -eo pipefail
umask 077
```

### A1. Conferir a VPS

**Servidor:**

```bash
free -h
kubectl top node
kubectl describe node | grep -A8 "Allocated resources"
kubectl -n braid get pods
grep -n "network-policy" /etc/rancher/k3s/config.yaml || echo "NetworkPolicy ligada (padrão do k3s)"
timedatectl | grep "Time zone"
```

Siga só se: houver pelo menos 2 GiB de memória livre fora dos pods atuais, os
pods `api`, `auth`, `web` e `postgres` estiverem `Running`, e o `grep` não
mostrar `disable-network-policy`. Se mostrar, pare: sem NetworkPolicy a chave
do Hermes vira a única barreira interna. Anote o fuso: a atualização diária roda
às 04:00 nesse horário.

### A2. Criar os campos no 1Password

No Environment **de produção**, crie os três campos abaixo. Gere cada valor no
seu computador com `openssl rand -hex 32`; os dois gerados têm de ser diferentes
entre si e diferentes dos valores locais.

| Campo | Valor |
| --- | --- |
| `HERMES_API_KEY` | novo, `openssl rand -hex 32` |
| `MCP_TOKEN` | novo, `openssl rand -hex 32` |
| `OPENROUTER_API_KEY` | já existe; confirme que está preenchido |

`MCP_TOKEN` só é usado na Parte B, mas entra no Secret agora para não refazê-lo.

### A3. Levar os quatro arquivos para a VPS

Eles não estão em `main`, e `/opt/braid/src` precisa continuar limpo (o deploy
recusa rodar com arquivos soltos lá). Copie para uma pasta à parte.

**Servidor:**

```bash
mkdir -p ~/hermes-install
```

**Seu computador**, na raiz do repositório, no branch `feat/web-na-api-nova`
(troque usuário, host e porta pelos do seu SSH):

```bash
scp -P <porta> ops/production/hermes.yaml ops/production/hermes-update.sh ops/production/hermes-update.service ops/production/hermes-update.timer <usuario>@<host>:hermes-install/
```

**Servidor:**

```bash
cd ~/hermes-install
ls -l
sudo install -m 0644 -o root -g root hermes.yaml /opt/braid/k8s/hermes.yaml
sudo install -m 0750 -o root -g root hermes-update.sh /opt/braid/bin/hermes-update.sh
sudo install -m 0644 -o root -g root hermes-update.service /etc/systemd/system/hermes-update.service
sudo install -m 0644 -o root -g root hermes-update.timer /etc/systemd/system/hermes-update.timer
```

Esperado: os quatro arquivos listados e nenhuma mensagem de erro.

### A4. Criar o Secret `hermes-env`

O método do [hermes.md](./hermes.md) (ler o escopo `hermes-runtime` pela imagem
`braid-api`) só funciona depois da Parte B, porque a imagem de produção de hoje
não conhece esse escopo. Por enquanto, cole os valores do 1Password; eles não
aparecem na tela nem ficam em disco.

**Servidor:**

```bash
umask 077
read -rsp "HERMES_API_KEY: " V1; echo
read -rsp "OPENROUTER_API_KEY: " V2; echo
read -rsp "MCP_TOKEN: " V3; echo
printf 'API_SERVER_KEY=%s\nOPENROUTER_API_KEY=%s\nMCP_TOKEN=%s\n' "$V1" "$V2" "$V3" > /opt/braid/private/hermes.env
unset V1 V2 V3
test "$(grep -c '=.' /opt/braid/private/hermes.env)" = 3 || echo "FALTOU UM VALOR"

kubectl -n braid create secret generic hermes-env \
  --from-env-file=/opt/braid/private/hermes.env \
  --dry-run=client -o yaml | kubectl apply -f -
shred -u /opt/braid/private/hermes.env
kubectl -n braid get secret hermes-env -o jsonpath='{.data}' | jq 'keys'
```

Esperado: `secret/hermes-env created` e as três chaves listadas
(`API_SERVER_KEY`, `MCP_TOKEN`, `OPENROUTER_API_KEY`). O Hermes lê a chave da API
como `API_SERVER_KEY`, por isso o nome muda em relação ao 1Password.

### A5. Criar o volume e configurar o Hermes antes de subir o gateway

Setup e gateway não podem abrir o volume ao mesmo tempo (é a mesma regra do
`pnpm hermes:setup` local). Então: primeiro só o volume, depois um pod
descartável com o assistente, e só então o gateway.

**Servidor**, criar só o volume (o primeiro documento do manifesto):

```bash
awk '/^---$/{exit} {print}' /opt/braid/k8s/hermes.yaml | kubectl apply -f -
kubectl -n braid get pvc hermes-data
```

Esperado: `persistentvolumeclaim/hermes-data created`, estado `Pending`. É
normal: o `local-path` só cria o disco quando o primeiro pod o monta.

**Servidor**, rodar o assistente (a confirmar na VPS; equivale ao `pnpm hermes:setup`):

```bash
kubectl -n braid run hermes-setup --rm -it --restart=Never \
  --pod-running-timeout=10m \
  --image=nousresearch/hermes-agent:stable \
  --overrides='{"spec":{"containers":[{"name":"hermes-setup","image":"nousresearch/hermes-agent:stable","args":["setup"],"stdin":true,"tty":true,"envFrom":[{"secretRef":{"name":"hermes-env"}}],"volumeMounts":[{"name":"data","mountPath":"/opt/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"hermes-data"}}]}}'
```

A primeira execução baixa a imagem, que é grande; pode levar alguns minutos sem
mostrar nada. No assistente:

- **Provedor:** OpenRouter. A chave já está no ambiente (vem do Secret); se ele
  perguntar, mantenha a detectada.
- **Modelo:** `deepseek/deepseek-v4.1-flash-1017` (ou o que você decidiu).
- **Terminal:** `local`, a menos que a decisão 1 tenha sido outra.
- **Plataformas de mensagem, voz e o resto:** pule. O Hermes só será usado pela API.

Ao terminar, o pod some sozinho. Confira:

```bash
kubectl -n braid get pod hermes-setup 2>&1 | tail -1
kubectl -n braid get pvc hermes-data
```

Esperado: `NotFound` para o pod e o PVC em `Bound`.

Se o `kubectl run` falhar antes de abrir o assistente, apague o resto com
`kubectl -n braid delete pod hermes-setup --ignore-not-found` e repita.

### A6. Subir o gateway

**Servidor:**

```bash
kubectl apply -f /opt/braid/k8s/hermes.yaml
kubectl -n braid rollout status deployment/hermes --timeout=300s
kubectl -n braid get pod -l app=hermes
kubectl -n braid logs deploy/hermes --tail=40
```

Esperado: pod `1/1 Running` e, nos logs, o servidor de API escutando na 8642.

- `Pending`: `kubectl -n braid describe pod -l app=hermes` (memória ou volume).
- `CrashLoopBackOff` com permissão negada em `/opt/data`: a imagem inicia como
  root, troca para o usuário `hermes` e ajusta o dono do volume sozinha; se não
  ajustar, anote o erro e pare aqui.

Confirme o modelo gravado. A imagem não tem `vi` nem `nano`, e os comandos do
Hermes devem rodar como o usuário `hermes`, não como root. O prefixo abaixo faz
isso e vale para todos os comandos `hermes` deste roteiro:

```bash
H="kubectl -n braid exec deploy/hermes -- env HOME=/opt/data /command/s6-setuidgid hermes hermes"
$H --version
$H config get model.default
```

Para trocar o modelo depois, sem assistente:
`$H config set model.default <modelo>` e
`kubectl -n braid rollout restart deployment/hermes`.

### A7. Validar o isolamento e a API

**Servidor:**

```bash
# 1) A API alcança o Hermes: deve imprimir 200.
kubectl -n braid exec deploy/api -- node -e \
  "fetch('http://hermes.braid.svc.cluster.local:8642/health').then(r=>console.log(r.status))"

# 2) Outro pod NÃO alcança: deve imprimir 'bloqueado' depois de 5 s.
kubectl -n braid exec deploy/web -- node -e \
  "fetch('http://hermes.braid.svc.cluster.local:8642/health',{signal:AbortSignal.timeout(5000)}).then(r=>console.log('ALCANCOU',r.status)).catch(()=>console.log('bloqueado'))"

# 3) Nada escuta no host: não deve listar a 8642.
sudo ss -ltn | grep 8642 || echo "8642 não exposta no host"

# 4) Com a chave, /v1/models responde: deve imprimir 200 e o nome do modelo.
kubectl -n braid get secret hermes-env -o jsonpath='{.data.API_SERVER_KEY}' | base64 -d \
  | kubectl -n braid exec -i deploy/api -- node -e '
    let k=""; process.stdin.on("data",d=>k+=d).on("end",async()=>{
      const r=await fetch("http://hermes.braid.svc.cluster.local:8642/v1/models",{headers:{authorization:"Bearer "+k}});
      console.log(r.status, JSON.stringify(await r.json()).slice(0,200));
    });'
```

Se o item 2 imprimir `ALCANCOU`, pare e corrija a NetworkPolicy antes de seguir.

Teste um turno de verdade, pelo mesmo caminho que a API usará:

```bash
kubectl -n braid get secret hermes-env -o jsonpath='{.data.API_SERVER_KEY}' | base64 -d \
  | kubectl -n braid exec -i deploy/api -- node -e '
    let k=""; process.stdin.on("data",d=>k+=d).on("end",async()=>{
      const r=await fetch("http://hermes.braid.svc.cluster.local:8642/v1/chat/completions",{method:"POST",
        headers:{authorization:"Bearer "+k,"content-type":"application/json"},
        body:JSON.stringify({model:"hermes-agent",messages:[{role:"user",content:"Responda apenas: ok"}]})});
      console.log(r.status, JSON.stringify(await r.json()).slice(0,300));
    });'
```

Esperado: `200` e uma resposta com "ok". Um erro de provedor aqui é chave do
OpenRouter errada ou modelo inexistente.

### A8. Ligar a atualização diária e provar o rollback

**Servidor:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-update.timer
systemctl list-timers hermes-update.timer
sudo systemctl start hermes-update.service
journalctl -u hermes-update.service -n 30 --no-pager
tail -n 5 /opt/braid/hermes-update.log
```

Esperado: `atual: ...@sha256:...` e depois `sem versao nova` ou `atualizado: ...`.
O Hermes fica cerca de 1 minuto fora durante a troca.

Prove o rollback uma vez, com uma cópia do script apontando para uma tag que não existe:

```bash
sed 's#^STABLE=.*#STABLE=nousresearch/hermes-agent:tag-que-nao-existe#' \
  /opt/braid/bin/hermes-update.sh | sudo tee /opt/braid/private/hermes-update-teste.sh >/dev/null
sudo bash /opt/braid/private/hermes-update-teste.sh; echo "saida=$?"
sudo rm -f /opt/braid/private/hermes-update-teste.sh
kubectl -n braid get pod -l app=hermes
```

Esperado: `falhou; voltando para ...@sha256:...`, `saida=1` e o pod `1/1 Running`.
O teste espera 5 minutos até desistir da tag inexistente; é normal.

### A9. Guardar uma cópia do volume

O `backup.sh` ainda não inclui o volume do Hermes. Até incluir, faça à mão
depois de configurar e sempre que mudar algo importante:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
kubectl -n braid exec deploy/hermes -- tar -C /opt/data -czf - . \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass file:/opt/braid/private/backup-passphrase \
      -out "/opt/braid/backups/hermes-data-$STAMP.tgz.enc"
ls -lh /opt/braid/backups/hermes-data-*.enc
```

É uma cópia a quente: os bancos SQLite do Hermes podem sair no meio de uma
escrita. Serve para recuperar configuração, memória e automações; não é um
backup transacional. Copie o arquivo para fora da VPS como os demais.

**Fim da Parte A.** O Hermes está no ar, atualiza sozinho e só a API o alcança.
Nada o chama ainda.

---

## Parte B: ligar o Hermes à aplicação

Pré-requisito: o branch `feat/web-na-api-nova` publicado em `main` e implantado,
com a virada de banco resolvida.

### B1. Antes do merge: campos do MCP no 1Password

O deploy passa a construir e subir o pod `mcp`. Sem estes campos no Environment
de produção ele não inicia, o `rollout status` estoura e **o deploy inteiro falha**.

| Campo | Valor |
| --- | --- |
| `MCP_TOKEN` | já criado no passo A2 |
| `MCP_OWNER_USER_ID` | o id do seu usuário em produção (comando abaixo) |
| `AUTH_INTERNAL_SERVICE_KEY` | já existe |
| `API_SERVICE_URL` | `http://api.braid.svc.cluster.local:3001`; já deve existir, o auth usa |

**Servidor:**

```bash
kubectl -n braid exec postgres-0 -- psql -U postgres -d braid_auth -c "select id, email from users"
```

### B2. Depois do deploy: conferir o MCP

**Servidor:**

```bash
kubectl -n braid get pod -l app=mcp
kubectl -n braid exec deploy/hermes -- curl -fsS http://mcp.braid.svc.cluster.local:3003/health
kubectl -n braid exec deploy/web -- node -e \
  "fetch('http://mcp.braid.svc.cluster.local:3003/health',{signal:AbortSignal.timeout(5000)}).then(r=>console.log('ALCANCOU',r.status)).catch(()=>console.log('bloqueado'))"
```

Esperado: pod `1/1 Running`, o Hermes recebe a resposta de saúde e o `web`
imprime `bloqueado`. A imagem do Hermes tem `curl`, não `wget`.

### B3. Registrar o MCP no Hermes

Veja se a configuração já tem a chave:

```bash
kubectl -n braid exec deploy/hermes -- grep -n '^mcp_servers:' /opt/data/config.yaml || echo "ainda não tem"
```

**Se imprimiu "ainda não tem"**, acrescente o bloco ao fim do arquivo:

```bash
kubectl -n braid exec -i deploy/hermes -- sh -c 'cat >> /opt/data/config.yaml' <<'EOF'

mcp_servers:
  braid:
    url: http://mcp.braid.svc.cluster.local:3003/mcp
    headers:
      Authorization: "Bearer ${MCP_TOKEN}"
    tools:
      include:
        - create_task
        - create_artifact
        - create_recurrence
        - list_agenda_tasks
        - list_tracked_tasks
        - list_artifacts
        - list_recurrences
        - get_task
        - get_artifact
        - get_recurrence
        - update_task
        - update_artifact
        - update_recurrence
EOF
```

**Se a chave já existe**, não acrescente (duas chaves iguais quebram o YAML).
Traga o arquivo, edite com `nano` na VPS e devolva:

```bash
kubectl -n braid exec deploy/hermes -- cat /opt/data/config.yaml > /opt/braid/private/hermes-config.yaml
nano /opt/braid/private/hermes-config.yaml
kubectl -n braid exec -i deploy/hermes -- sh -c 'cat > /opt/data/config.yaml' < /opt/braid/private/hermes-config.yaml
shred -u /opt/braid/private/hermes-config.yaml
```

`${MCP_TOKEN}` fica literal no arquivo; o valor vem do Secret. Reinicie e confira:

```bash
kubectl -n braid rollout restart deployment/hermes
kubectl -n braid rollout status deployment/hermes --timeout=300s
H="kubectl -n braid exec deploy/hermes -- env HOME=/opt/data /command/s6-setuidgid hermes hermes"
$H mcp list
$H mcp test braid
```

Esperado: servidor `braid` com 13 ferramentas selecionadas e o teste listando
as 13 (`create_task` ... `update_recurrence`).

### B4. Provar a criação de uma entidade

**Servidor:**

```bash
kubectl -n braid get secret hermes-env -o jsonpath='{.data.API_SERVER_KEY}' | base64 -d \
  | kubectl -n braid exec -i deploy/api -- node -e '
    let k=""; process.stdin.on("data",d=>k+=d).on("end",async()=>{
      const ask=()=>fetch("http://hermes.braid.svc.cluster.local:8642/v1/chat/completions",{method:"POST",
        headers:{authorization:"Bearer "+k,"content-type":"application/json"},
        body:JSON.stringify({model:"hermes-agent",messages:[{role:"user",content:
          "Use a ferramenta create_task para criar uma tarefa com o nome \"teste do hermes\" e idempotencyKey \"teste-hermes-1\". Responda só com o id."}]})}).then(r=>r.json());
      console.log(JSON.stringify(await ask()).slice(0,400));
      console.log(JSON.stringify(await ask()).slice(0,400));
    });'
```

Esperado: as duas respostas com o mesmo id e **uma** tarefa "teste do hermes" na
agenda. Apague-o pelo app. Se o Hermes responder sem usar a ferramenta, veja
`kubectl -n braid logs deploy/mcp --tail=50`.

### B5. Ligar a rota na API

No Environment de produção do 1Password, crie:

| Campo | Valor |
| --- | --- |
| `AI_AUTOMATION` | `on` |
| `HERMES_URL` | `http://hermes.braid.svc.cluster.local:8642` |
| `AGENT_CONFIG_OWNER_USER_ID` | o mesmo id de `MCP_OWNER_USER_ID` |

`HERMES_API_KEY` já existe (passo A2) e o escopo `api-runtime` passa a lê-la.
Com `AI_AUTOMATION=on` e sem a chave, a API não sobe.

**Servidor:**

```bash
kubectl -n braid rollout restart deployment/api
kubectl -n braid rollout status deployment/api --timeout=300s
kubectl -n braid logs deploy/api --tail=30
```

### B6. Testar pelo app

No chat da web de produção, como dono:

```text
/hermes responda apenas: ok
/hermes crie uma nota com o título "teste do hermes em produção"
/app
```

Esperado: a resposta aparece no chat com os passos do Hermes acima dela, a nota
surge na agenda e `/app` volta ao assistente normal.

- **"O Hermes está desligado" (404):** `AI_AUTOMATION` não chegou à API; confira o campo e reinicie a API.
- **"A IA está indisponível":** Hermes fora do ar, chave diferente entre o Secret
  `hermes-env` e o 1Password, ou turno acima de 150 s.

---

## O que ainda não funciona em produção depois deste roteiro

- **Skills e agentes como notas e o pedido de edição de arquivo** (ADR 0005). A
  pasta compartilhada entre a API e o Hermes não é montada em produção: a API
  enxerga uma pasta vazia dentro do próprio container e o Hermes não tem
  `/opt/agent-files`. Precisa de mudança em `ops/production/hermes.yaml`,
  `apps.template.yaml` e `backup.sh` antes de valer.
- **Backup automático** do volume do Hermes (o passo A9 é manual).
- **Alerta** quando a atualização diária falha (`systemctl is-failed hermes-update.service`).
- **Saída de rede do pod do Hermes sem restrição.** A NetworkPolicy só limita
  quem entra. De dentro do pod o agente alcança a internet e os outros Services
  do cluster (Postgres, API, auth), protegidos só pelas próprias credenciais.
- **Android** sem o modo Hermes.

## Parar e desfazer

| Preciso de | Comando |
| --- | --- |
| Parar o Hermes mantendo os dados | `kubectl -n braid scale deployment/hermes --replicas=0` e `sudo systemctl disable --now hermes-update.timer` |
| Voltar a subir | `kubectl -n braid scale deployment/hermes --replicas=1` e reative o timer |
| Desligar só a rota do app | `AI_AUTOMATION=off` no 1Password e `kubectl -n braid rollout restart deployment/api` |
| Remover tudo, **apagando memória e automações** | `kubectl delete -f /opt/braid/k8s/hermes.yaml` (apaga também o volume; irreversível) |

Não use `kubectl delete -f` para "reiniciar": o manifesto inclui o volume.
Logs, versão em execução, rotação de chaves e problemas comuns: seções 3 e 4 do
[hermes.md](./hermes.md).
