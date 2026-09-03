# Fase 3 — Ingress e TLS

## 1. Objetivo

Traefik e cert-manager rodando no cluster, escutando em portas alternativas, com um
certificado válido emitido para um host de teste — sem que o Traefik do Compose, que
ainda serve produção, seja tocado.

## 2. Por que isso existe

Existe uma quantidade fixa de portas 80 e 443 num servidor, e é uma. Durante as fases 3 a
5 há dois reverse proxies querendo as mesmas duas portas, e essa disputa é o ponto
genuinamente arriscado desta migração — o lugar onde uma execução desatenta derruba o
site de verdade.

A saída é não disputar. O Traefik do cluster sobe em `8080/8443`, e o Traefik do Compose,
que já tem os certificados e já é o dono das portas públicas, passa a encaminhar para ele
os hosts novos. Produção continua onde está; o cluster ganha um caminho de entrada real
para ser testado.

A troca de proxy vira então um evento único, curto e reversível, na Fase 5 — em vez de um
estado ambíguo de várias semanas.

A segunda razão da fase é o **cert-manager**. No v1, o Traefik obtinha os certificados
sozinho, guardando-os num `acme.json`. Isso funciona e é menos peça. Aqui não serve, por
um motivo específico: o certificado precisa sobreviver ao Traefik ser recriado por um
rollout, e precisa ser compartilhável entre Ingress diferentes (`app`, `api`, `grafana`).
Com o cert-manager, o certificado é um `Secret` do Kubernetes — um objeto com ciclo de
vida próprio, que não morre junto com o pod que o usa.

## 3. Passo a passo

### 3.1 — cert-manager primeiro

```bash
# ☸️ cluster
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/vFIXE_A_VERSAO/cert-manager.yaml
kubectl -n cert-manager get pods
```

Esperado: `cert-manager`, `cert-manager-webhook` e `cert-manager-cainjector` em `Running`.
O webhook é o que costuma demorar; um `Issuer` criado antes de ele estar pronto falha com
`connection refused` e a mensagem não deixa óbvio que é só questão de esperar.

### 3.2 — Dois issuers, staging primeiro

⚠️ A lição do v1 sobre rate limit do Let's Encrypt continua valendo inteira. O ambiente de
produção do Let's Encrypt limita emissões por domínio por semana, e uma configuração
errada queima a cota rapidinho — deixando você sem certificado e sem poder tentar de novo.

```yaml
# ingress/issuers.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: {name: letsencrypt-staging}
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: SEU_EMAIL
    privateKeySecretRef: {name: letsencrypt-staging-account}
    solvers:
      - http01:
          ingress: {class: traefik}
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: {name: letsencrypt}
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: SEU_EMAIL
    privateKeySecretRef: {name: letsencrypt-account}
    solvers:
      - http01:
          ingress: {class: traefik}
```

Todo Ingress nasce apontando para `letsencrypt-staging`. A troca para `letsencrypt`
acontece host a host, só depois de a emissão de staging funcionar para aquele host.

### 3.3 — Traefik em portas alternativas

```yaml
# ingress/traefik-values.yaml — trecho do HelmRelease
ports:
  web:
    port: 8000
    hostPort: 8080
    redirectTo: {port: websecure}
  websecure:
    port: 8443
    hostPort: 8443
providers:
  kubernetesIngress: {enabled: true}
  kubernetesCRD: {enabled: true}
resources:
  requests: {memory: 64Mi, cpu: 50m}
  limits: {memory: 192Mi}
priorityClassName: prod-critical
```

`hostPort` publica a porta diretamente no nó, sem o `servicelb` que foi desabilitado na
Fase 1. Com um nó só, é o caminho com menos indireção.

⚠️ `hostPort` fura o `iptables` do Docker do mesmo jeito que `ports:` no Compose furava —
o item 1.2 do checklist de segurança do v1 continua se aplicando. Confirme que 8080 e 8443
não estão acessíveis de fora no passo 5.

### 3.4 — Middlewares equivalentes aos do v1

Os middlewares do v1 viram objetos do cluster. Mesmos valores, outra sintaxe:

```yaml
# ingress/middlewares.yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: {name: security-headers, namespace: ingress}
spec:
  headers:
    contentTypeNosniff: true
    frameDeny: true
    referrerPolicy: strict-origin-when-cross-origin
    permissionsPolicy: "camera=(), microphone=(), geolocation=()"
    stsSeconds: 31536000
    stsIncludeSubdomains: true
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: {name: rate-limit, namespace: ingress}
spec:
  rateLimit: {average: 50, burst: 100}
```

⚠️ Não ligue o HSTS (`stsSeconds`) enquanto o certificado for do issuer de staging. Um
navegador que recebe HSTS de um host com certificado inválido passa a recusar aquele host,
e o "desligue e teste de novo" deixa de funcionar até o cache do navegador expirar. Deixe
`stsSeconds: 0` até a Fase 5.

### 3.5 — A ponte a partir do Traefik do Compose

Um host de teste que prova o caminho inteiro sem tocar em produção. No Compose:

```yaml
# /opt/stack/traefik/dynamic/bridge.yml
http:
  routers:
    to-cluster:
      rule: "Host(`grafana.SEUDOMINIO.com`)"
      entrypoints: [websecure]
      service: cluster
      tls: {certresolver: letsencrypt}
  services:
    cluster:
      loadBalancer:
        servers:
          - url: "https://127.0.0.1:8443"
        serversTransport: cluster-transport
  serversTransports:
    cluster-transport:
      insecureSkipVerify: true
```

O `insecureSkipVerify` aqui é aceitável e temporário: o salto é `localhost`, com o
certificado do lado de dentro ainda sendo de staging. Ele sai na Fase 5, junto com esse
arquivo inteiro. Registre isso, porque `insecureSkipVerify` esquecido é dívida clássica.

Aponte `grafana.SEUDOMINIO.com` no DNS para o VPS, crie o Ingress do Grafana no cluster
com autenticação, e confirme o caminho: navegador → Traefik do Compose → Traefik do
cluster → Grafana. Isso encerra o `port-forward` da Fase 2.

## 4. Por que não fazer diferente

**Corte direto: parar o Traefik do Compose e subir o do cluster nas portas 80/443.**
Mais simples e mais curto. Descartado porque o primeiro erro de configuração acontece com
o site fora do ar e sem caminho de teste — e configuração de Ingress erra na primeira
tentativa quase sempre. Se você tivesse um domínio de teste separado e nenhum usuário,
esta seria a escolha certa.

**Manter o ACME dentro do Traefik, sem cert-manager.** É o que o v1 fazia, funciona, e
tem uma peça a menos. Descartado por dois motivos concretos: o `acme.json` num pod é um
arquivo que precisa de volume próprio e não é compartilhável entre serviços, e o
certificado como `Secret` do Kubernetes é o que permite que `api.dominio` (Fase 10) e
`staging.dominio` (Fase 9) usem o mesmo mecanismo sem duplicar armazenamento.

**Caddy no lugar do Traefik.** Genuinamente mais simples para HTTPS automático, como a
[ADR-004 do v1](../docs/adr/004-traefik.md) já reconhecia. Descartado pelo mesmo motivo de
lá, mais um novo: o Traefik é o Ingress Controller com melhor integração no ecossistema
k3s, e trocar de proxy no meio de uma troca de plataforma é mudar duas variáveis de uma
vez.

**ingress-nginx.** O Ingress Controller mais usado do mercado, e por isso o de material
mais abundante. Seria a escolha certa se o objetivo fosse empregabilidade máxima nessa
peça específica. Descartado para não trocar de proxy junto com a troca de orquestrador,
e porque a configuração por anotação do nginx é bem menos legível que os CRDs do Traefik.

**DNS-01 em vez de HTTP-01.** Necessário se você quiser certificado curinga ou emitir sem
expor a porta 80. Custa uma credencial de API do provedor de DNS guardada no cluster.
Vale revisitar se a Cloudflare entrar na frente do domínio, como sugere o item 2.2 do
checklist do v1.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl -n ingress get pods
kubectl get clusterissuer
```

Esperado: o Traefik em `Running`; os dois `ClusterIssuer` com `READY: True`. Um issuer com
`READY: False` quase sempre é o registro da conta ACME falhando — leia o `status` inteiro
com `kubectl describe`.

```bash
# 🖥️ servidor
ss -tulpn | grep -E ':80 |:443 |:8080 |:8443 '
```

Esperado: `80` e `443` no processo do Traefik **do Docker**; `8080` e `8443` no do
cluster. Se `80` aparecer duas vezes, um dos dois não subiu e você ainda não percebeu.

```bash
# 💻 local
nmap -Pn -p 80,443,6443,8080,8443 SEU_IP
```

Esperado: `80` e `443` abertas; `6443`, `8080` e `8443` `filtered`. Este é o teste que
prova que o `hostPort` não furou o firewall.

```bash
# ☸️ cluster
kubectl -n observability get certificate
kubectl -n observability describe certificate grafana-tls | tail -20
```

Esperado: `READY: True` e um evento `Certificate issued successfully`. Enquanto estiver em
staging, o navegador vai reclamar da cadeia — isso é o esperado, não um erro.

Por fim, o teste que importa: abrir `https://grafana.SEUDOMINIO.com` e chegar no Grafana,
aceitando o aviso de certificado. Isso prova os dois saltos e o Ingress de uma vez.

E o teste que prova que nada quebrou:

```bash
# 💻 local
curl -I https://app.SEUDOMINIO.com/health
```

Esperado: `200`, com o mesmo certificado válido de antes da fase. Produção não foi tocada.

## 6. Armadilhas comuns

**`Certificate` parado em `False` com o desafio HTTP-01 falhando.** O desafio precisa
chegar na porta 80 **do cluster**, e nesta fase a porta 80 pública é do Compose. Por isso
o issuer de staging é validado através da ponte, e por isso o corte da Fase 5 revalida
tudo. Se o desafio não passar, confira se a ponte encaminha também o caminho
`/.well-known/acme-challenge/`.

**HSTS ligado com certificado de staging.** Descrito em 3.4. O sintoma é o navegador
recusando o host mesmo depois de você consertar, e a correção envolve limpar o HSTS nas
configurações do navegador — para cada navegador e dispositivo que já visitou.

**`hostPort` conflitando.** Se outro processo já usa 8080, o pod fica `Pending` com evento
`node(s) didn't have free ports for the requested pod ports`. A mensagem é clara, mas
aparece no `describe` do pod, não no `get`.

**Esquecer o `insecureSkipVerify` ligado.** Ele é temporário por desenho. Anote-o na lista
de pendências da Fase 5 no mesmo momento em que escrevê-lo.

**Rate limit do Let's Encrypt queimado.** Sintoma: `too many certificates already issued
for exact set of domains`. Não há solução além de esperar uma semana ou usar outro
subdomínio. É por isso que o staging vem primeiro.

## 7. Para estudar

- 🆓 [cert-manager — Concepts](https://cert-manager.io/docs/concepts/) — Issuer, Certificate e o `Secret` resultante.
- 🆓 [Let's Encrypt — Rate Limits](https://letsencrypt.org/docs/rate-limits/) — leia antes, não depois.
- 🆓 [Traefik — Kubernetes Ingress provider](https://doc.traefik.io/traefik/providers/kubernetes-ingress/)
- 🆓 [Kubernetes — Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- 🆓 [MDN — Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) — por que HSTS é difícil de desfazer.
