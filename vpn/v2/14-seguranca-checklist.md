# 14 — Checklist de segurança

Consolidado, consultado de forma não-linear. Herda o
[checklist do v1](../docs/11-seguranca-checklist.md) — os itens que continuam válidos são
citados, não reescritos — e acrescenta a superfície que o Kubernetes, o GitOps e a camada
de LLM trouxeram.

🔴 marca item bloqueante: a fase correspondente não termina sem ele.

---

## Parte 1 — O que continua valendo do v1

Estes itens não mudaram de conteúdo, só de ferramenta. Releia o v1 para o raciocínio.

| Item do v1 | Estado no v2 |
|---|---|
| 🔴 1.1 Nenhuma porta além de 22, 80 e 443 | continua, agora com `6443`, `8080` e `8443` na lista do que **não** pode vazar |
| 🔴 1.2 O Docker não fura o firewall | vira: o `hostPort` do Traefik não fura o firewall |
| 🔴 1.3 SSH apenas por chave, sem root | inalterado, e agora também é o caminho do `kubectl` |
| 🔴 1.4 TLS em tudo, com HSTS | inalterado; emitido pelo cert-manager |
| 🔴 1.5 Segredos fora do git | evolui: cifrados **dentro** do git com SOPS |
| 🔴 1.6 Containers como usuário não-root | vira `runAsNonRoot` no `securityContext` |
| 🔴 1.7 Todo container com limite | vira `requests` **e** `limits` em todo workload |
| 🔴 1.8 Redis com senha e comandos perigosos desabilitados | inalterado |
| 1.9 Usuário de aplicação sem privilégio administrativo no Postgres | inalterado, mais duas roles novas |
| 1.10 Rate limiting ativo | inalterado, mais um perfil próprio para a API pública |
| 1.11 Validação de entrada na aplicação | inalterado |
| 1.12 Dashboards internos nunca sem autenticação | vale para Grafana e staging |
| 🔴 2.1 Backup off-site com restore testado | mais forte: o banco agora tem dado real |
| 2.2 Cloudflare na frente do domínio | inalterado |
| 🔴 2.3 Chave SSH do CI restrita | **eliminado**: não há mais chave SSH de CI (Fase 6) |
| 2.4 Scan de imagem e atualização de dependências | inalterado |
| 🔴 2.5 Rotação de logs | vira retenção do VictoriaLogs |
| 🔴 2.6 Firewall cobrindo IPv6 | inalterado, e mais importante com portas novas |
| 2.7 Gestão de segredos com caminho de evolução | **resolvido** pelo SOPS |
| 2.8 Variáveis de build viram públicas | inalterado |
| 2.9 Não envie e-mail pelo VPS | inalterado |
| 2.10 Detecção de comprometimento | inalterado, mais os itens abaixo |
| 2.11 Socket do Docker exposto ao Traefik | **eliminado** na Fase 11 |
| 2.12 LGPD | ampliado: prompts e transcrições são dado pessoal |
| 2.13, 2.14, 2.15 | inalterados |

---

## Parte 2 — Superfície do Kubernetes

### 🔴 2.1 A porta 6443 nunca é pública

```bash
# 💻 local
nmap -Pn -p 6443 SEU_IP
```

Esperado: `filtered`. A API do Kubernetes na internet é alvo de varredura constante, e uma
credencial vazada dá controle total do servidor. O acesso é por túnel SSH.

### 🔴 2.2 O kubeconfig é tratado como chave privada

Modo `600` no servidor e na sua máquina. Fora de diretório sincronizado com nuvem. Nunca
no git. Ele contém uma credencial de administrador do cluster, sem expiração.

### 🔴 2.3 Secrets criptografados em repouso

```bash
# 🖥️ servidor
k3s secrets-encrypt status
```

Esperado: `Enabled`. Sem isso, Secret do Kubernetes é base64 — quem lê o datastore lê tudo.

### 🔴 2.4 NetworkPolicy default-deny em `prod`

```bash
# ☸️ cluster
kubectl -n prod run netpol-test --rm -it --restart=Never --image=busybox --labels="app=web" -- nc -zv postgres 5432
```

Esperado: timeout. O `web` não alcança o banco. Esta é a regra que substituiu a rede
`internal: true` do v1 — e diferente dela, é testável.

### 2.5 Contexto de segurança em todo pod

`runAsNonRoot`, `allowPrivilegeEscalation: false`, `capabilities` com `drop: [ALL]`,
`readOnlyRootFilesystem` onde a aplicação permitir. É o mesmo endurecimento que o v1
aplicava no Compose; nenhum deles pode ter sido perdido na migração.

### 2.6 RBAC mínimo para as ServiceAccounts

O Alloy precisa **ler** pods, nodes e endpoints — não escrever. O Flux precisa de
permissão ampla por natureza, e é por isso que o repositório dele é protegido por 2FA e
proteção de branch (item 2.14 do v1).

### 2.7 Nenhum PVC de dado com acesso externo

```bash
# 💻 local
nmap -Pn -p 5432,6379 SEU_IP
```

Esperado: `filtered` nas duas. Nenhum Service de banco ganha `hostPort` ou `NodePort`.

---

## Parte 3 — GitOps e segredos

### 🔴 3.1 Nenhum segredo em texto claro no repositório

```bash
# 💻 local
git grep -iE "(PASSWORD|API_KEY|SECRET)=" -- deploy/ | grep -v enc.yaml
grep -rl "BEGIN AGE ENCRYPTED" deploy/secrets/ | wc -l
```

Esperado: primeiro comando **sem saída**; segundo maior que zero.

### 🔴 3.2 A chave age tem duas cópias e nenhuma no git

Gerenciador de senhas e uma cópia offline. É o único item desta spec sem plano de
recuperação: perdida a chave, nenhum segredo versionado volta a ser legível.

### 3.3 Rotação de segredo troca o valor, não só o arquivo

Um segredo cifrado no git está no histórico para sempre. Se a chave age vazar, todo o
histórico vaza junto. Rotacionar significa gerar um valor novo, não recriptografar o
antigo.

### 3.4 A superfície da ADR-007 não existe mais

```bash
# 🖥️ servidor
id ci
```

Esperado: `no such user`. E nenhum secret começando com `VPS_` no GitHub.

---

## Parte 4 — Camada de LLM

### 🔴 4.1 A aplicação nunca recebe a chave mestra do LiteLLM

Ela recebe uma chave virtual, com orçamento, limite de requisições por minuto e lista de
modelos permitidos. A chave mestra cria chaves e lê spend de todo mundo.

### 🔴 4.2 Prompt não vira log indexado, atributo de span nem label de métrica

Descrição de refeição e transcrição de voz são dado pessoal. Três camadas: configuração do
LiteLLM (Fase 7), redação no Alloy (Fase 8), e revisão dos `console.log` dos gateways.

Teste: gere um evento por voz com uma frase reconhecível e procure por ela nos logs.
Esperado: **não achar**.

### 4.3 Teto de gasto em três camadas

`MAX_COST_USD` por requisição, limite por minuto na chave, orçamento mensal na chave.
Nenhuma das três substitui as outras.

### ⚠️ 4.4 Não há quota por usuário final

Risco declarado e aceito. Um usuário autenticado abusivo é contido pelo orçamento global,
derrubando a funcionalidade para todos até o mês virar. Mitigado por rate limit por IP e
por usuário. Gatilho de revisão: base de usuários além de pessoas conhecidas. Detalhado na
[Fase 10](12-fase-10-api-publica.md) e na [ADR-109](adr/109-api-publica.md).

### 4.5 Entrada do usuário chega a um modelo com ferramentas

O agente executa skills que escrevem no banco. Isso é a superfície de prompt injection
(LLM01 do OWASP). As proteções que já existem: teto de passos, teto de custo, timeout por
skill, e o fato de as skills só saberem criar evento do próprio usuário autenticado.
Qualquer skill nova precisa passar por essa revisão.

---

## Parte 5 — Auditoria mensal

```bash
# 💻 local
nmap -Pn -p 1-1024,3000,3001,4000,5432,6379,6443,8080,8443 SEU_IP
git grep -iE "(PASSWORD|API_KEY|SECRET)=" -- deploy/ | grep -v enc.yaml
```

```bash
# ☸️ cluster
kubectl get networkpolicy -A
kubectl get pods -A -o wide
flux get all -A
```

```bash
# 🖥️ servidor
k3s secrets-encrypt status
ufw status verbose
ls -l /etc/rancher/k3s/k3s.yaml
```

Mais: conferir o gasto do mês contra o orçamento, conferir que o backup rodou nas últimas
26 horas, e ler a lista de imagens em uso contra os CVEs do último scan.

---

## Modelo de ameaça

O do v1 continua valendo — o atacante realista é automatizado, não dirigido a você. O que
o v2 acrescenta:

| Ativo novo | Ameaça | Contenção |
|---|---|---|
| API do Kubernetes | varredura da porta 6443 exposta | firewall, túnel SSH |
| kubeconfig | roubo do arquivo | modo 600, fora de nuvem |
| Chave age | vazamento dá todo o histórico de segredos | duas cópias, nenhuma no git |
| Orçamento de LLM | abuso de rota de IA | três camadas de teto, rate limit |
| Prompts e transcrições | vazamento de dado pessoal | redação em três pontos |
| Repositório git | quem escreve no `main` implanta em produção | 2FA, proteção de branch |

O último é o mais importante e o menos óbvio: com GitOps, **acesso de escrita ao
repositório é acesso de deploy em produção**. O item 2.14 do v1, que era boa prática,
vira controle de acesso ao servidor.
