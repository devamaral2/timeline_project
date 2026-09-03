# Fase 6 — Secrets e GitOps

## 1. Objetivo

Flux reconciliando o cluster a partir de `deploy/` no monorepo, segredos versionados em
forma cifrada com SOPS e age, atualização automática de imagem observando o GHCR, e a
chave SSH do CI removida do servidor.

## 2. Por que isso existe

Duas dívidas do v1 fecham aqui, e as duas foram registradas por ele mesmo.

A primeira está no item 2.7 do
[checklist de segurança](../docs/11-seguranca-checklist.md): "gestão de segredos com
caminho de evolução". O que existia era um `.env` em modo `600` e uma promessa. Isso
funciona, mas tem três buracos: não há histórico de quem mudou o quê, não há revisão antes
da mudança, e recriar o servidor do zero depende de um arquivo que só existe no servidor.
Com SOPS o segredo entra no git **cifrado** — o que é diferente de entrar em claro, e é a
distinção que a regra de ouro nº 5 faz.

A segunda está na [ADR-007](../docs/adr/007-deploy-ssh.md), que escolheu deploy push por
SSH e disse, com todas as letras, qual era o problema: *"Push exige que o CI tenha uma
credencial de acesso ao servidor — o que é exatamente o ponto sensível desta decisão."*
A mitigação era boa (usuário dedicado, `command=` amarrando a chave a um script). Ainda
assim, um comprometimento do GitHub Actions dava acesso ao servidor.

Com GitOps a seta se inverte: o cluster **puxa** do git. O CI perde qualquer credencial de
acesso ao servidor — ele só publica imagem no GHCR, que já era necessário. Não há mais
chave SSH de CI para proteger, porque não há mais chave SSH de CI.

Tem um terceiro ganho, menos citado e muito útil no dia a dia: **detecção de drift**. Se
alguém — você, às onze da noite — der um `kubectl edit` para resolver um incidente, o Flux
reverte na próxima reconciliação. Isso é chato exatamente uma vez, e depois vira a garantia
de que o git descreve o cluster de verdade.

## 3. Passo a passo

### 3.1 — Onde os manifestos moram

`deploy/` no próprio monorepo, não num repositório separado:

```text
deploy/
  clusters/vps-1/          Kustomization raiz que o Flux observa
  base/
    prod/                  web, api, postgres, redis, litellm
    observability/         alloy, victoriametrics, victorialogs, tempo, grafana
    ingress/               traefik, middlewares, issuers
  overlays/
    prod/
    staging/               Fase 9
  secrets/                 *.enc.yaml, cifrados por SOPS
```

Repositório separado é a recomendação comum, e o argumento é bom: separa o ciclo de vida
da aplicação do da infraestrutura. Aqui o monorepo ganha por um motivo específico — a
mudança de código do LiteLLM na Fase 7 toca `apps/api` **e** `deploy/` ao mesmo tempo, e
poder revisar as duas no mesmo PR vale mais que a separação.

Isso respeita a estrutura do `AGENTS.md`: `deploy/` não é workspace do pnpm, não entra no
`turbo`, e nenhum app importa dele.

### 3.2 — SOPS com age

```bash
# 💻 local
age-keygen -o age.agekey
```

⚠️ A chave privada **não** vai para o git. Ela vai para o seu gerenciador de senhas e para
um Secret no cluster. Perder essa chave significa não conseguir mais decifrar nenhum
segredo versionado — e diferente do `.env` do v1, não há cópia em claro em lugar nenhum.

```bash
# ☸️ cluster
kubectl -n flux-system create secret generic sops-age --from-file=age.agekey=./age.agekey
```

```yaml
# .sops.yaml na raiz do repo
creation_rules:
  - path_regex: deploy/secrets/.*\.enc\.yaml$
    encrypted_regex: "^(data|stringData)$"
    age: SUA_CHAVE_PUBLICA_AGE
```

`encrypted_regex` importa: só os valores são cifrados, e nomes, labels e estrutura ficam
legíveis. Um diff de segredo passa a mostrar *que* o segredo mudou sem mostrar *para o
quê* — que é exatamente o que se quer numa revisão.

Os segredos que migram do `.env` do v1: credenciais do PostgreSQL, senha do Redis, chaves
do Firebase Admin, chave do OpenRouter (que na Fase 7 vira a chave virtual do LiteLLM) e
a senha do admin do Grafana.

### 3.3 — Instalar o Flux

```bash
# 💻 local
flux bootstrap github \
  --owner=SEU_USUARIO \
  --repository=timeline_project \
  --branch=main \
  --path=deploy/clusters/vps-1 \
  --components-extra=image-reflector-controller,image-automation-controller \
  --personal
```

Os dois controllers extras são o que substitui o passo de deploy do CI: eles observam as
tags no GHCR e commitam a nova no repositório. O rollout acontece porque o commit
aconteceu.

### 3.4 — Automação de imagem

```yaml
# deploy/clusters/vps-1/image-automation.yaml — trecho
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata: {name: api, namespace: flux-system}
spec:
  imageRepositoryRef: {name: api}
  filterTags:
    pattern: "^[0-9a-f]{40}$"
  policy:
    numerical: {order: asc}
```

O `filterTags` com SHA de 40 caracteres preserva a lição do v1: *"`latest` é mutável;
somente SHA identifica uma release"*. O que muda é quem escreve o SHA — antes era um
script no servidor mexendo em `.env.images`, agora é um commit assinado pelo Flux, com
histórico no git.

### 3.5 — O CI encolhe

O workflow do v1 tinha quatro jobs: `validate`, `detect`, `build`, `deploy`. O `deploy`
some inteiro, e com ele os três secrets do GitHub:

| Secret do v1 | Destino |
|---|---|
| `VPS_HOST` | removido |
| `VPS_USER` | removido |
| `VPS_SSH_KEY` | removido |

```bash
# 🖥️ servidor
userdel -r ci
rm -f /usr/local/bin/deploy-from-ci
```

⚠️ Só execute isto depois de o Flux ter feito ao menos um deploy completo com sucesso.
Remover o caminho antigo antes de o novo funcionar deixa você sem nenhum.

O `validate` continua igual — `npm run --silent test:ai`, `pnpm turbo run typecheck`,
`pnpm turbo run build` — e o `build` continua publicando as duas imagens por SHA no GHCR,
com o scan do Trivy. O que ele não faz mais é tocar no servidor.

### 3.6 — Dashboards e alertas versionados

Aproveite que o Flux existe para resolver a pendência da Fase 2: os dashboards do Grafana
e as regras de alerta saem da UI e viram arquivos em `deploy/base/observability/`.

Um alerta que só existe na interface tem dois problemas: some se o volume sumir, e ninguém
revisa a mudança dele. Versionado, ele passa por PR como qualquer código.

## 4. Por que não fazer diferente

**Manter o deploy push por SSH.** Funciona, já está escrito e é uma peça a menos. Seria a
escolha certa se você não fosse rodar Kubernetes — o GitOps só faz sentido com um
controlador dentro do cluster. Descartado porque a própria ADR-007 identificou a
credencial no CI como o ponto sensível, e agora existe uma forma de eliminá-la em vez de
mitigá-la.

**Argo CD em vez de Flux.** Argo tem UI, é mais popular e aparece mais em vaga de emprego —
argumentos reais. Descartado por consumo: a instalação completa do Argo pesa bem mais que
os controllers do Flux, e a UI dele quer ser exposta, o que significa mais um host, mais
uma autenticação e mais uma superfície. Se a UI for importante para você, troque; o
desenho do `deploy/` não muda.

**Sealed Secrets em vez de SOPS.** Modelo mais simples: o controller no cluster tem a
chave, você cifra com a pública, e pronto. Descartado porque o SOPS decifra localmente com
a mesma chave, o que permite ler e editar um segredo da sua máquina sem passar pelo
cluster — útil em recuperação de desastre, que é justamente quando o cluster não existe.

**External Secrets com um cofre (Vault, Doppler, AWS SM).** É o desenho correto a partir
de duas pessoas na equipe, e resolve rotação de verdade. Descartado por acrescentar um
serviço para operar — ou uma dependência paga — para um servidor com um usuário. É o
próximo passo se isso mudar.

**Repositório separado para os manifestos.** A recomendação padrão, pelas razões da 3.1.
Descartado pelo PR único que atravessa `apps/api` e `deploy/`. Se a infra ganhar vida
própria, separar depois é barato — o Flux só precisa de outro `GitRepository`.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
flux check
flux get all -A
```

Esperado: todos os `Kustomization` e `HelmRelease` com `READY: True` e uma revisão que
bate com o commit atual do `main`.

O teste que prova a detecção de drift:

```bash
# ☸️ cluster
kubectl -n prod scale deploy/web --replicas=5
sleep 90
kubectl -n prod get deploy web
```

Esperado: voltou para `2`. Se ficou em `5`, o Flux não está reconciliando aquele recurso —
e você tem uma falsa sensação de que o git descreve o cluster.

O teste que prova o pipeline inteiro, ponta a ponta:

```bash
# 💻 local
git commit --allow-empty -m "test: gitops end to end" && git push
```

E acompanhe: CI valida → build publica a imagem por SHA no GHCR → o
image-reflector detecta → o image-automation commita o SHA novo em `deploy/` → o Flux
reconcilia → `kubectl -n prod rollout status deploy/api` mostra a revisão nova. Cronometre
uma vez, para saber quanto tempo é o normal.

```bash
# ☸️ cluster
kubectl -n prod get secret postgres-credentials -o jsonpath="{.data.password}" | base64 -d
```

Esperado: a senha em claro — o que prova que o SOPS decifrou. E, no git:

```bash
# 💻 local
grep -r "BEGIN AGE ENCRYPTED" deploy/secrets/ | wc -l
git grep -i "POSTGRES_APP_PASSWORD=" -- deploy/ | wc -l
```

Esperado: o primeiro maior que zero, o segundo **exatamente zero**. Nenhum segredo em
claro no repositório.

```bash
# 🖥️ servidor
id ci
ls /usr/local/bin/deploy-from-ci
```

Esperado: `no such user` e `No such file or directory` nos dois. A superfície da ADR-007
não existe mais.

## 6. Armadilhas comuns

**`Kustomization` em `False` com `failed to decrypt`.** O Secret `sops-age` não existe em
`flux-system`, ou a chave pública no `.sops.yaml` não corresponde à privada. A mensagem é
clara, mas o instinto é procurar erro de YAML.

**Chave age perdida.** ⚠️ Sem ela, nenhum segredo versionado volta a ser legível — nem por
você. Gerenciador de senhas **e** uma cópia offline. Este é o único item desta spec sem
plano de recuperação.

**Flux revertendo um conserto de emergência.** É o comportamento correto, mas surpreende
na primeira vez. Para uma intervenção legítima, `flux suspend kustomization NOME`, conserte,
e depois leve a correção ao git antes de dar `flux resume`.

**Automação de imagem commitando em loop.** Se a `ImagePolicy` casar com tags que o build
regenera, o Flux commita, o CI roda, e o ciclo se realimenta. O `filterTags` restrito a
SHA de 40 caracteres evita isso.

**Remover o usuário `ci` cedo demais.** Descrito em 3.5. Um deploy completo pelo Flux
primeiro, sempre.

**Achar que segredo cifrado no git é segredo seguro para sempre.** Ele é seguro enquanto a
chave for. Se a chave vazar, todo o histórico do git vaza junto — e histórico não se
reescreve facilmente. Rotacionar segredo cifrado exige rotacionar o valor, não só o
arquivo.

## 7. Para estudar

- 🆓 [Flux — Get Started](https://fluxcd.io/flux/get-started/) e [Image Update Automation](https://fluxcd.io/flux/guides/image-update/)
- 🆓 [SOPS](https://github.com/getsops/sops) e [age](https://github.com/FiloSottile/age)
- 🆓 [OpenGitOps — os quatro princípios](https://opengitops.dev/) — declarativo, versionado, puxado, reconciliado continuamente. Curto e vale a leitura antes de instalar.
- 🆓 [Kustomize — bases e overlays](https://kubectl.docs.kubernetes.io/references/kustomize/) — base da Fase 9.
- 🆓 [Kubernetes — Secrets: as limitações](https://kubernetes.io/docs/concepts/configuration/secret/#risks) — a seção de riscos explica por que `--secrets-encryption` da Fase 1 era necessário.
