# Hermes: setup local e na VPS

Decisão e motivos: [ADR 004](../../.agents/docs/ai-dialog/adr-004-hermes-automacoes.md).
Resumo: o Hermes (`nousresearch/hermes-agent`) roda como container **interno**
para executar as automações. Só a API fala com ele; ele não tem Ingress, Tunnel
nem porta pública. A imagem usa a tag `stable` e, na VPS, se atualiza todo dia
com validação e rollback.

```text
Navegador → web → API ──(rede interna, Bearer HERMES_API_KEY)──→ Hermes :8642
                                                                   ├─ volume /opt/data
                                                                   │  (config, memória, cron)
                      API ←── MCP :3003 ←──(Bearer MCP_TOKEN)──────┘
                      (cria entidades como o dono, com Idempotency-Key)
```

**Estado desta entrega:** o Hermes sobe, responde, se atualiza e consegue criar
entidades na agenda pelo MCP (`apps/mcp`). A API ainda **não** o chama: o ramo de
automação do roteador é trabalho seguinte (ver "Fora do escopo" do ADR).

**O que veio da documentação oficial e o que confirmar na primeira execução.**
Da documentação: imagem, `gateway run`, volume `/opt/data`, as variáveis
`API_SERVER_*`, `GET /health`, `GET /v1/models`, atualização por `pull` e
reinício. A confirmar ao subir pela primeira vez: o comando `hermes setup`
dentro do pod, o usuário/permissão do volume e a margem de memória
(`ops/production/hermes.yaml` pede 1 GiB e limita a 2 GiB).

## 0. Segredos no 1Password (uma vez)

Os escopos `hermes-runtime` (container do Hermes) e `mcp-runtime` (servidor MCP)
exigem estes campos no Environment:

| Campo | Escopo | Valor |
| --- | --- | --- |
| `HERMES_API_KEY` | `hermes-runtime` | chave que a API usará como Bearer no Hermes. `openssl rand -hex 32`, uma por ambiente. |
| `OPENROUTER_API_KEY` | `hermes-runtime` | já existe; o Hermes usa a mesma conta do OpenRouter. |
| `MCP_TOKEN` | `hermes-runtime` e `mcp-runtime` | Bearer que o Hermes apresenta ao MCP. `openssl rand -hex 32`, uma por ambiente, **diferente** de `HERMES_API_KEY` e da chave do gateway. |
| `AUTH_INTERNAL_SERVICE_KEY` | `mcp-runtime` | já existe (a mesma da API e do auth). |
| `MCP_OWNER_USER_ID` | `mcp-runtime` | id do **seu** usuário (veja abaixo). Todas as ferramentas do MCP agem sobre os dados dele. |
| `API_SERVICE_URL` | `mcp-runtime` | só em produção: `http://api.braid.svc.cluster.local:3001`. Local, o loader deriva de `API_PORT`. |

Para achar o seu id, consulte o banco do auth:

```bash
# Local (Postgres compartilhado da porta 54391; ajuste o nome do banco da worktree)
psql "$AUTH_DATABASE_URL" -c "select id, email from users"
```

```bash
# VPS
kubectl -n braid exec postgres-0 -- psql -U postgres -d braid_auth -c "select id, email from users"
```

Os campos não estão em `.env.example` de propósito: assim `pnpm dev` não passa a
exigi-los. Confira:

```bash
ONEPASSWORD_SCOPE=hermes-runtime pnpm secrets:check
ONEPASSWORD_SCOPE=mcp-runtime pnpm secrets:check
```

Esperado: sem variável ausente.

> **Antes de mergear em `main`:** o próximo deploy da VPS constrói e sobe o pod
> `mcp`. Sem `MCP_TOKEN` e `MCP_OWNER_USER_ID` no Environment de produção ele não
> inicia e o `rollout status` do deploy falha. Crie os campos primeiro.

## 1. Local

Pré-requisito: Docker rodando e o 1Password configurado como em
[onepassword.md](./onepassword.md).

Há **um Hermes por máquina**, compartilhado pelas worktrees (como o Postgres),
porque o volume não pode ser aberto por dois gateways. Consequência:
as automações e a memória do Hermes local valem para todas as worktrees.

**Primeira vez: configurar antes de subir.**

```bash
pnpm hermes:setup
```

O assistente grava a configuração no volume `hermes-data`. Escolha o OpenRouter
como provedor e o modelo que preferir. Termine antes do próximo passo: setup e
gateway não podem abrir o volume ao mesmo tempo.

**Subir:**

```bash
pnpm hermes:up
```

**Verificar** (a porta fica só em `127.0.0.1`):

```bash
curl -fsS http://127.0.0.1:8642/health
```

```bash
ONEPASSWORD_SCOPE=hermes-runtime pnpm secrets:exec -- sh -c \
  'curl -fsS -H "Authorization: Bearer $HERMES_API_KEY" http://127.0.0.1:8642/v1/models'
```

Esperado: `/health` responde 200 e `/v1/models` lista o modelo `hermes-agent`
(ou o nome definido em `API_SERVER_MODEL_NAME`). Sem o cabeçalho, `/v1/models`
deve recusar. A chave é lida dentro do `sh -c` e não aparece no terminal.

**Atualizar** (manual, quando quiser a `stable` mais recente):

```bash
pnpm hermes:update
```

Ele faz `pull` e recria o container; o volume permanece e as migrações de
configuração do Hermes rodam na inicialização. Para voltar a uma versão, suba
com `HERMES_IMAGE_TAG=<X.Y.Z>` (por exemplo
`HERMES_IMAGE_TAG=1.2.3 pnpm hermes:up`).

**Logs e parada:**

```bash
pnpm hermes:logs
pnpm hermes:down
```

`hermes:down` mantém o volume. Para apagar também a memória e as automações
locais: `docker volume rm braid-hermes_hermes-data` (irreversível).

### 1.1 Conectar o Hermes ao MCP (local)

O MCP (`apps/mcp`) é o único caminho do Hermes até a sua agenda: cria, lê e edita
eventos (com status, o evento é o que a tela chama de tarefa), artefatos de texto
(as notas) e recorrências, sempre como o `MCP_OWNER_USER_ID`, e não
apaga nada. Toda edição exige a `revision` lida antes (`get_*`).

O MCP sobe junto com o resto: `pnpm dev` (web, API, auth e MCP) e `pnpm worktree:new`
já o iniciam. Para subir só ele (com a API já rodando): `pnpm dev:mcp`.

- **Escuta em `0.0.0.0`** para o container alcançá-lo por `host.docker.internal`.
  A porta fica aberta à sua rede local enquanto ele roda; o Bearer (`MCP_TOKEN`) é a
  proteção, então não deixe o `pnpm dev` rodando em rede que você não controla.
- **Aponta para a API da worktree em que roda** (`API_PORT` do `.env.local`), então
  cada worktree fala com a própria API.
- **Porta:** a principal usa `MCP_PORT` do `.env.local` ou, sem ele, `3003`. Worktrees
  novas recebem uma porta livre em `MCP_PORT`. Se a `3003` estiver ocupada por outra
  worktree, defina `MCP_PORT=<porta livre>` no `.env.local` da principal. O
  `config.yaml` do Hermes aponta para uma porta só: ao trocar a worktree ativa,
  ajuste a porta na `url` do servidor `braid` e reinicie o Hermes.
- **`MCP_OWNER_USER_ID` por worktree:** cada worktree tem o próprio banco de auth, logo
  o próprio id do `admin@admin.com`. Em uma worktree, ponha o id dela em
  `MCP_OWNER_USER_ID=` no `.env.local` (o valor local vence o do 1Password), senão as
  entidades criadas ficam invisíveis para o admin dessa worktree.
- **Opcional:** sem `MCP_TOKEN` ou `MCP_OWNER_USER_ID` no 1Password o MCP não sobe, avisa
  no log (`[mcp] nao iniciou`) e o `pnpm dev` segue com web, API e auth.

Teste o MCP sozinho (deve listar as 13 ferramentas):

```bash
ONEPASSWORD_SCOPE=mcp-runtime pnpm secrets:exec -- sh -c \
  'curl -fsS -X POST http://127.0.0.1:3003/mcp \
     -H "Authorization: Bearer $MCP_TOKEN" \
     -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
     -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"'
```

Depois registre o MCP no Hermes. O `config.yaml` fica no volume; abra-o:

```bash
docker exec -it braid-hermes sh -c 'ls /opt/data/config.yaml && ${EDITOR:-vi} /opt/data/config.yaml'
```

e acrescente (ou una à chave `mcp_servers:` se ela já existir):

```yaml
mcp_servers:
  braid:
    url: http://host.docker.internal:3003/mcp
    headers:
      Authorization: "Bearer ${MCP_TOKEN}"
    tools:
      include:
        - create_event
        - create_artifact
        - create_recurrence
        - list_timeline_events
        - list_tracked_events
        - list_artifacts
        - list_recurrences
        - get_event
        - get_artifact
        - get_recurrence
        - update_event
        - update_artifact
        - update_recurrence
```

`${MCP_TOKEN}` vem do ambiente do container; o token não é escrito no arquivo.
Reinicie (`docker restart braid-hermes`) e confira nos logs
(`pnpm hermes:logs`) que o servidor `braid` conectou e registrou as ferramentas
`mcp_braid_*`. Se `host.docker.internal` não resolver, confirme que o
`docker-compose.hermes.yml` tem o `extra_hosts` e recrie com `pnpm hermes:up`.

### 1.2 Falar com o Hermes pela aplicação (local)

A API tem uma rota que entrega mensagens ao Hermes: `POST /api/requests/hermes`. O
navegador nunca fala com o Hermes; ele fala com a API, que chama o Hermes pela rede
interna (`HERMES_URL`, `HERMES_API_KEY`) e devolve a resposta como um pedido comum
(`GET /api/requests/:requestId`). No chat da web, `/hermes` liga o **modo Hermes**: dali em diante as mensagens vão ao
Hermes, e não ao assistente da agenda, até você escrever `/app` (ou `/assistente`,
`/sair`) ou abrir outra conversa.

```text
/hermes
me diga como conectar ao google agenda
crie uma nota com o resumo do meu dia
/app
```

`/hermes <mensagem>` liga o modo e já envia a mensagem. Em modo normal, sem `/hermes`, o
chat continua sendo o assistente da agenda. Enquanto o Hermes trabalha, o chat mostra os **passos** dele: cada ferramenta numa linha
(`Executou um comando · date`, `Pesquisou na web · …`, `Criou uma nota`), e cada pensamento
recolhido, que abre ao clicar. Os passos ficam acima da resposta depois que o turno
termina. A resposta do Hermes aparece no chat e a
agenda atualiza ao fim, porque ele pode ter criado ou editado registros pelo MCP. As
mensagens do modo Hermes não entram no histórico da conversa do app (o Hermes guarda a
própria sessão), então recarregar a página limpa a tela.

A rota vem **desligada**. Para ligá-la nesta worktree, ponha no `.env.local` da raiz:

```dotenv
AI_AUTOMATION=on
```

Reinicie `pnpm dev`. `HERMES_API_KEY` vem do 1Password (o mesmo campo do Hermes) e
`HERMES_URL` assume `http://127.0.0.1:8642`; mude-o no `.env.local` se mapeou outra
porta (`HERMES_HOST_PORT`). Requisito: o container do Hermes no ar (`pnpm hermes:up`). As mensagens
são jobs na fila única do Postgres ([ai-jobs.md](./ai-jobs.md)); não há broker para subir.

- **404 no chat ("O Hermes está desligado"):** `AI_AUTOMATION` não está `on` na API.
- **"A IA está indisponível":** o Hermes está fora do ar, a chave está errada ou o turno
  passou de 150 s. A API repete sozinha só quando o Hermes está fora do ar ou ocupado
  (429/503); um tempo esgotado não é repetido, porque o Hermes pode já ter criado
  entidades. Confira `pnpm hermes:logs` e o log da API.
- Só o dono fala com o Hermes: a API recusa (403) um `userId` diferente do usuário logado.

## 2. VPS (k3s)

> **Para instalar do zero, siga [hermes-vps.md](./hermes-vps.md).** Ele traz a
> ordem completa e corrige três pontos desta seção: a imagem não tem `vi` nem
> `wget`, e o `hermes setup` roda num pod à parte, antes do gateway.

Pré-requisitos: o [deploy k3s](./deploy-k3s.md) concluído, esta mudança já em
`main` e implantada (a imagem `braid-api:<sha>` precisa conhecer o escopo
`hermes-runtime`), e `HERMES_API_KEY` presente no Environment de produção.

### 2.1 Instalar os arquivos versionados

**Servidor / Bash**, em `/opt/braid/src` no commit implantado:

```bash
cd /opt/braid/src
sudo install -m 0644 -o root -g root ops/production/hermes.yaml /opt/braid/k8s/hermes.yaml
sudo install -m 0750 -o root -g root ops/production/hermes-update.sh /opt/braid/bin/hermes-update.sh
sudo install -m 0644 -o root -g root ops/production/hermes-update.service /etc/systemd/system/hermes-update.service
sudo install -m 0644 -o root -g root ops/production/hermes-update.timer /etc/systemd/system/hermes-update.timer
```

### 2.2 Criar o Secret `hermes-env`

A imagem do Hermes não traz o loader do 1Password, então os valores saem do
escopo `hermes-runtime` por um container da API já construído e viram um Secret.

**Servidor / Bash:**

```bash
source /opt/braid/env.sh
source /opt/braid/release.env          # define SHA
umask 077
(
  export OP_SERVICE_ACCOUNT_TOKEN="$(cat /opt/braid/private/onepassword-token)"
  export OP_ENVIRONMENT_ID
  docker run --rm -e OP_SERVICE_ACCOUNT_TOKEN -e OP_ENVIRONMENT_ID \
    -e ONEPASSWORD_SCOPE=hermes-runtime "braid-api:$SHA" \
    node scripts/onepassword/exec.mjs sh -c \
    'printf "API_SERVER_KEY=%s\nOPENROUTER_API_KEY=%s\nMCP_TOKEN=%s\n" "$HERMES_API_KEY" "$OPENROUTER_API_KEY" "$MCP_TOKEN"'
) > /opt/braid/private/hermes.env
test "$(grep -c '=.' /opt/braid/private/hermes.env)" = 3 || { echo "Faltou um valor"; exit 1; }

kubectl -n braid create secret generic hermes-env \
  --from-env-file=/opt/braid/private/hermes.env \
  --dry-run=client -o yaml | kubectl apply -f -
shred -u /opt/braid/private/hermes.env
```

Esperado: `secret/hermes-env created` (ou `configured`). O Secret usa os nomes
que o Hermes lê (`API_SERVER_KEY`), por isso o arquivo não repete `HERMES_API_KEY`.

### 2.3 Subir

**Servidor / Bash:**

```bash
kubectl apply -f /opt/braid/k8s/hermes.yaml
kubectl -n braid rollout status deployment/hermes --timeout=300s
kubectl -n braid get pod -l app=hermes
```

Esperado: pod `1/1 Running`. Se ficar `Pending`, veja `kubectl -n braid describe pod -l app=hermes`
(memória ou PVC); se reiniciar, veja os logs (seção 3).

### 2.4 Configurar o Hermes uma vez

**Servidor / Bash:**

```bash
kubectl -n braid exec -it deploy/hermes -- hermes setup
```

Escolha o OpenRouter e o modelo. A configuração fica em `/opt/data`, no PVC,
e sobrevive às atualizações. Se o comando `hermes` não existir no pod, abra um
shell (`kubectl -n braid exec -it deploy/hermes -- sh`) e veja o que a imagem
instala; a documentação oficial descreve o assistente como `setup`.

### 2.5 Validar isolamento e API

**Servidor / Bash:**

```bash
# 1) A API alcança o Hermes (deve imprimir 200).
kubectl -n braid exec deploy/api -- node -e \
  "fetch('http://hermes.braid.svc.cluster.local:8642/health').then(r=>console.log(r.status))"

# 2) Outro pod NÃO alcança (deve imprimir 'bloqueado' após 5 s).
kubectl -n braid exec deploy/web -- node -e \
  "fetch('http://hermes.braid.svc.cluster.local:8642/health',{signal:AbortSignal.timeout(5000)}).then(r=>console.log('ALCANCOU',r.status)).catch(()=>console.log('bloqueado'))"

# 3) Nada escuta fora do cluster (não deve listar a 8642).
sudo ss -ltn | grep 8642 || echo "8642 não exposta no host"
```

Se o item 2 imprimir `ALCANCOU`, o k3s não está aplicando NetworkPolicy
(`--disable-network-policy`?): corrija antes de seguir, porque a chave do Hermes
passaria a ser a única barreira interna.

### 2.6 Ligar a atualização diária

**Servidor / Bash:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-update.timer
systemctl list-timers hermes-update.timer
```

Rode uma vez na mão para provar o caminho completo:

```bash
sudo systemctl start hermes-update.service
journalctl -u hermes-update.service -n 30 --no-pager
tail -n 5 /opt/braid/hermes-update.log
```

Esperado: `atual: ...@sha256:...` seguido de `sem versao nova` ou `atualizado: ...`.

O timer roda às 04:00 **no fuso da VPS** (`timedatectl`). Durante ~1 minuto o
Hermes fica indisponível (estratégia `Recreate`).

**Testar o rollback uma vez**, para saber que funciona antes de precisar. O
script repõe `stable` logo no início, então a falha precisa vir de dentro dele:
faça uma cópia com uma tag inexistente, rode-a e confirme que ela volta ao
digest anterior e sai com erro.

```bash
sed 's#^STABLE=.*#STABLE=nousresearch/hermes-agent:tag-que-nao-existe#' \
  /opt/braid/bin/hermes-update.sh | sudo tee /opt/braid/private/hermes-update-teste.sh >/dev/null
sudo bash /opt/braid/private/hermes-update-teste.sh; echo "saida=$?"
sudo rm -f /opt/braid/private/hermes-update-teste.sh
kubectl -n braid get pod -l app=hermes
```

Esperado: `falhou; voltando para ...@sha256:...`, `saida=1` e o pod `1/1 Running`
na versão anterior. O `rollout status` da tag inexistente espera 5 minutos até
estourar o tempo; é normal.

### 2.7 Conectar o Hermes ao MCP

O pod `mcp` sobe com o deploy normal (`apps.template.yaml`, imagem `braid-mcp`),
alcançável só pelo pod do Hermes (`NetworkPolicy mcp-from-hermes-only`).
Confira:

**Servidor / Bash:**

```bash
kubectl -n braid get pod -l app=mcp
# O Hermes alcança (200); a API e o web não (bloqueado).
kubectl -n braid exec deploy/hermes -- sh -c 'wget -qO- http://mcp.braid.svc.cluster.local:3003/health || true'
kubectl -n braid exec deploy/web -- node -e \
  "fetch('http://mcp.braid.svc.cluster.local:3003/health',{signal:AbortSignal.timeout(5000)}).then(r=>console.log('ALCANCOU',r.status)).catch(()=>console.log('bloqueado'))"
```

Se a imagem do Hermes não tiver `wget`, use `curl` ou pule o primeiro teste: a
prova final é a seção seguinte. Registre o MCP no `config.yaml` do volume:

```bash
kubectl -n braid exec -it deploy/hermes -- sh -c '${EDITOR:-vi} /opt/data/config.yaml'
```

```yaml
mcp_servers:
  braid:
    url: http://mcp.braid.svc.cluster.local:3003/mcp
    headers:
      Authorization: "Bearer ${MCP_TOKEN}"
    tools:
      include:
        - create_event
        - create_artifact
        - create_recurrence
        - list_timeline_events
        - list_tracked_events
        - list_artifacts
        - list_recurrences
        - get_event
        - get_artifact
        - get_recurrence
        - update_event
        - update_artifact
        - update_recurrence
```

`MCP_TOKEN` já está no Secret `hermes-env` (seção 2.2). Reinicie e confira:

```bash
kubectl -n braid rollout restart deployment/hermes
kubectl -n braid rollout status deployment/hermes --timeout=300s
kubectl -n braid logs deploy/hermes --tail=50 | grep -i mcp
```

Esperado: conexão com o servidor `braid` e as ferramentas `mcp_braid_*`
registradas. O arquivo `config.yaml` está no PVC e sobrevive às atualizações.

### 2.8 Provar a criação de uma entidade

Peça ao Hermes uma criação com chave fixa e confirme que repetir não duplica.
Pelo mesmo caminho que a API usará:

**Servidor / Bash:**

```bash
KEY=$(kubectl -n braid get secret hermes-env -o jsonpath='{.data.API_SERVER_KEY}' | base64 -d)
printf '%s' "$KEY" | kubectl -n braid exec -i deploy/api -- node -e '
  let key = ""; process.stdin.on("data", d => key += d).on("end", async () => {
    const ask = () => fetch("http://hermes.braid.svc.cluster.local:8642/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ model: "hermes-agent", messages: [{ role: "user", content:
        "Use a ferramenta create_event para criar um evento com o nome \"teste do hermes\" e idempotencyKey \"teste-hermes-1\". Responda só com o id." }] }),
    }).then(r => r.json());
    console.log(JSON.stringify(await ask()).slice(0, 400));
    console.log(JSON.stringify(await ask()).slice(0, 400));
  });'
```

Esperado: as duas respostas trazem o mesmo `eventId`, e a agenda mostra **um**
evento "teste do hermes". Apague-o pelo app depois. Se o Hermes responder sem usar a
ferramenta, veja os logs do MCP (`kubectl -n braid logs deploy/mcp`).

## 3. Operação

| Preciso de | Comando |
| --- | --- |
| Logs | `kubectl -n braid logs deploy/hermes --tail=100` |
| Versão em execução | `kubectl -n braid get pod -l app=hermes -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'` |
| Histórico das atualizações | `tail -n 50 /opt/braid/hermes-update.log` e `journalctl -u hermes-update.service` |
| Atualizar agora | `sudo systemctl start hermes-update.service` |
| Pausar as atualizações | `sudo systemctl disable --now hermes-update.timer` |
| Fixar numa versão | pare o timer e `kubectl -n braid set image deployment/hermes hermes=nousresearch/hermes-agent:<X.Y.Z>` |
| Rotacionar `MCP_TOKEN` | troque no 1Password, repita 2.2, `kubectl -n braid rollout restart deployment/hermes deployment/mcp` |
| Rotacionar `HERMES_API_KEY` | troque no 1Password, repita 2.2 e `kubectl -n braid rollout restart deployment/hermes` (e a API, quando ela passar a usar a chave) |

Uma atualização que falha deixa o `hermes-update.service` em estado `failed`
e a versão anterior no ar. Veja `systemctl is-failed hermes-update.service`.
Ainda não há alerta automático: confira o estado de vez em quando ou ligue o
serviço ao Grafana/Prometheus que já existe.

## 4. Problemas comuns

- **`HERMES_API_KEY must come from the hermes-runtime scope` (local):** subiu
  com `docker compose` direto. Use `pnpm hermes:up`.
- **`configuração incompleta ... HERMES_API_KEY` (`secrets:*`):** o campo não
  existe no Environment usado. Crie-o (seção 0).
- **Pod `CrashLoopBackOff` depois de uma atualização:** o `hermes-update.sh`
  já terá voltado ao digest anterior; guarde os logs do pod com falha antes
  de investigar.
- **Permissão negada em `/opt/data`:** o usuário do processo na imagem não é o
  dono do volume. Descubra o usuário (`kubectl -n braid exec deploy/hermes -- id`)
  e ajuste com `securityContext.fsGroup` em `ops/production/hermes.yaml`.
- **Duas instâncias abertas no mesmo volume:** nunca aumente `replicas` nem
  suba o compose local apontando para o mesmo volume de outra máquina.

## 5. Pendências conhecidas

- **O Hermes tem terminal e execução de código sem sandbox** (aviso do próprio gateway) e terá outras conexões além do MCP. O container é a fronteira: não monte `docker.sock` nem pastas do host nele, mantenha no ambiente só as chaves necessárias, e libere no firewall só o que ele precisa. Cada conexão nova entra com a menor credencial possível. Decidir sobre o terminal antes de usar na VPS (ADR 004, pergunta 0).
- O estado do Hermes (`/opt/data`) **não está no `backup.sh`**. Antes de haver
  automações de usuários, acrescente o volume ao backup cifrado.
- Sem alerta de falha da atualização diária.
- O MCP não apaga entidades; se uma automação precisar disso, é uma decisão nova (ADR 004).
- Idempotência: a chave vale por 30 dias e por rota; reutilizá-la com outro conteúdo devolve 422.
- A API ainda não usa `HERMES_URL`/`HERMES_API_KEY`; ao implementar, acrescente
  as duas ao escopo `api-runtime` e atualize `docs/runbook/onepassword.md`.
