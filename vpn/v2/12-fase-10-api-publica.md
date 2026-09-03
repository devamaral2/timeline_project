# Fase 10 — API pública para o app mobile

## 1. Objetivo

A API alcançável em `https://api.SEUDOMINIO.com` pelo app Expo, com CORS em allowlist,
rate limit próprio, limites de corpo e timeout, logs sem token e uma varredura externa
confirmando que nada além disso ficou exposto.

## 2. Por que isso existe

O app mobile existe e não alcança o servidor. Hoje ele só funciona com
`MOBILE_API_URL` apontando para a máquina de desenvolvimento na rede local, o que
significa que ele não funciona fora dela — ou seja, não funciona.

A [Fase 5 do v1](../docs/07-fase-5-traefik-e-tls.md) adiou isso de propósito, e listou o
que faltava: host HTTPS dedicado, CORS allowlist, rate limit próprio, autenticação com log
sem token, `MOBILE_API_URL` em HTTPS e teste de abuso. Esta fase executa essa lista.

Vale lembrar por que o v1 tratou isso como etapa separada em vez de "adicionar um label":
publicar a API muda o modelo de ameaça. Até aqui, quem falava com a API era o Next, na
mesma máquina, e toda requisição passava por uma superfície controlada. A partir daqui, a
API recebe tráfego arbitrário da internet — incluindo requisições que não vêm do seu app.

## 3. Passo a passo

### 3.1 — O risco que precisa ser decidido antes

⚠️ Leia isto antes de configurar qualquer coisa.

As rotas de IA custam dinheiro por chamada. A Fase 7 montou três camadas de contenção, e
todas as três são **globais da aplicação**:

| Camada | Contém o quê | Não contém |
|---|---|---|
| `MAX_COST_USD = 0.05` | uma requisição cara | mil requisições baratas |
| `rpm_limit` da chave | pico agregado | uso sustentado |
| `max_budget` mensal | gasto total do mês | **um usuário específico** |

A consequência, dita sem rodeio: **um usuário autenticado que abuse das rotas de IA é
contido pelo orçamento global** — isto é, derrubando a funcionalidade para todo mundo até
o mês virar. Não há, hoje, nada que limite um usuário individual.

Quota por usuário final ficou fora do escopo por decisão explícita. Enquanto os usuários
forem você e um punhado de pessoas conhecidas, isso é um risco aceitável e consciente. As
mitigações desta fase reduzem o dano, não o eliminam:

- rate limit por IP no Traefik;
- rate limit por usuário autenticado antes de chegar ao gateway de LLM, usando o Redis que
  já existe;
- alerta de custo quando o gasto do mês passar de metade do orçamento — que é o sinal de
  que a decisão precisa ser revisitada.

Se a base de usuários crescer para desconhecidos, quota por usuário deixa de ser opcional.
Isso está registrado em [`adr/109-api-publica.md`](adr/109-api-publica.md) como gatilho de
revisão.

### 3.2 — Ingress próprio

```yaml
# prod/api-ingress.yaml — trecho
metadata:
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: >-
      ingress-security-headers@kubernetescrd,
      ingress-api-rate-limit@kubernetescrd,
      ingress-api-buffering@kubernetescrd
spec:
  rules:
    - host: api.SEUDOMINIO.com
```

Middlewares próprios, não os do web — o perfil de tráfego é outro:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: {name: api-rate-limit, namespace: ingress}
spec:
  rateLimit:
    average: 20
    burst: 40
    period: 1m
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: {name: api-buffering, namespace: ingress}
spec:
  buffering:
    maxRequestBodyBytes: 1048576
```

O limite de corpo de 1 MiB tem alvo específico: a rota de voz recebe áudio ou transcrição.
Sem teto, ela é um caminho para consumir memória do pod e orçamento de LLM com uma
requisição só.

O rate limit é bem mais apertado que o do web (20/min contra 50/s), porque um app mobile
legítimo faz poucas requisições por minuto, e porque a maioria das rotas de IA leva
segundos.

### 3.3 — CORS em allowlist

O app Expo nativo não envia `Origin`, então CORS não o protege — ele protege contra um
site qualquer chamando sua API pelo navegador do usuário.

A allowlist tem exatamente os hosts que precisam: `https://app.SEUDOMINIO.com` e, se você
usar o Expo web em desenvolvimento, o host local.

⚠️ `Access-Control-Allow-Origin: *` combinado com credenciais é a configuração errada
clássica. Se a resposta inclui cookie ou header de autorização, o curinga não pode existir.

O `main.ts` já liga CORS condicionalmente quando `API_HOST` não é loopback — lógica que a
Fase 5 já exercita, já que num pod o host é `0.0.0.0`. O que muda aqui é a lista.

### 3.4 — Autenticação e logs

O app já autentica por Firebase. A API já valida o token. O que esta fase acrescenta é a
conferência de que **nada disso vaza para o log**.

Com tráfego direto da internet, o access log do Traefik passa a registrar requisições que
antes eram internas. A configuração do v1 já derrubava headers por padrão
(`fields.headers.defaultMode: drop`) — mantenha, e confirme.

Confira também os `console.log` dos gateways de IA. Eles hoje registram tamanho de texto e
nome de skill, não conteúdo — o que está certo. Vale reler os três arquivos com olhos de
"isto vai para um log que dura 14 dias".

### 3.5 — O app aponta para HTTPS

`MOBILE_API_URL=https://api.SEUDOMINIO.com` no `.env`, lido pelo `app.config.ts` e
repassado ao app pelo campo `extra`.

Lembre da regra do `AGENTS.md`: tudo em `extra` vai embutido no bundle. A URL é pública por
natureza, então não há problema — mas é um bom momento para reconferir que nada mais
sensível entrou junto.

Depois disso, `API_HOST=0.0.0.0` no `.env` de desenvolvimento deixa de ser necessário para
o celular alcançar a API: ele passa a falar com produção. Mantenha a instrução no
`AGENTS.md` para quem quiser rodar contra a máquina local.

### 3.6 — Ordem das rotas, que continua importando

O `AGENTS.md` registra que em `events.controller.ts` as rotas estáticas (`daily`, `ai`,
`voice`) precisam vir antes de `:eventId`, senão o parâmetro dinâmico captura as três. Há
um teste travando isso (`events.routing.test.ts`).

Com a API pública, esse detalhe ganha uma consequência de segurança além da funcional: uma
rota de IA capturada por `:eventId` responderia errado a uma requisição externa, de um jeito
difícil de diagnosticar. Confirme que o teste passa antes de publicar.

### 3.7 — Se der errado

Esta é a fase mais fácil de reverter de todo o plano, e vale saber disso antes de começar:
nada em produção depende do host novo. O web continua falando com a API pela rede interna
do cluster, como antes.

```bash
# ☸️ cluster
flux suspend kustomization prod
kubectl -n prod delete ingress api
```

Isso tira a API da internet e deixa tudo o mais no lugar. O app mobile volta a não
alcançar o servidor — que é o estado de antes desta fase, não uma regressão.

Reverter é a resposta certa se aparecer: abuso das rotas de IA, tráfego não identificado
em volume, ou custo subindo sem uso correspondente. Leve a remoção ao git antes de
`flux resume`, e volte a publicar depois de entender o que aconteceu.

⚠️ Não reverta apagando o `Certificate`. Emitir de novo consome cota do Let's Encrypt, e
a Fase 3 já explicou o preço disso. O `Certificate` pode ficar; sem Ingress, ele não
serve tráfego nenhum.

## 4. Por que não fazer diferente

**Manter tudo passando pelo Next.** O app mobile chamaria `app.SEUDOMINIO.com/api/*` e
nenhum host novo seria necessário. Funciona, e é a opção com menos superfície. Descartado
por dois motivos: todo tráfego do mobile pagaria um salto extra e a memória de um pod de
Next que não está renderizando nada, e o rate limit e os limites de corpo do web não
servem para o perfil do mobile. Se você quisesse a menor superfície possível, essa seria a
escolha certa.

**Um gateway de API dedicado.** Autenticação, quota e roteamento numa camada própria. É o
desenho correto com vários clientes e várias APIs. Descartado por ser uma peça inteira
para um app e uma API.

**mTLS entre app e API.** Elimina o tráfego que não vem do seu app. Descartado por
distribuição de certificado num app publicado ser um problema maior que o que resolve.

**Quota por usuário agora.** Seria a resposta completa ao risco de 3.1, em vez da parcial.
Ficou fora de escopo por decisão. As mitigações reduzem o dano; o gatilho de revisão está
na ADR-109.

## 5. Como garantir que está certo

```bash
# 💻 local
curl -I https://api.SEUDOMINIO.com/health
curl -I https://app.SEUDOMINIO.com/health
```

Esperado: `200` nos dois, com certificado válido e HSTS presente.

```bash
# 💻 local — sem token
curl -i https://api.SEUDOMINIO.com/events/daily
```

Esperado: `401`. Se vier `200`, a autenticação não está sendo exigida na rota — que é a
falha mais grave possível nesta fase.

```bash
# 💻 local — CORS de origem nao autorizada
curl -i -H "Origin: https://exemplo-malicioso.com" https://api.SEUDOMINIO.com/events/daily
```

Esperado: sem `Access-Control-Allow-Origin` na resposta.

```bash
# 💻 local — rate limit
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code} " https://api.SEUDOMINIO.com/health; done; echo
```

Esperado: uma sequência de `200` virando `429`. Se nunca virar, o middleware não está
aplicado no router certo.

```bash
# 💻 local — limite de corpo
head -c 5000000 /dev/urandom | curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  --data-binary @- https://api.SEUDOMINIO.com/events
```

Esperado: `413`.

```bash
# 💻 local — varredura externa completa
nmap -Pn -p 1-1024,3000,3001,4000,5432,6379,6443,8080,8443 SEU_IP
```

Esperado: apenas `22`, `80` e `443` abertas. Este é o teste que fecha a fase.

E o teste que importa: instalar o development build no celular, com `MOBILE_API_URL`
apontando para produção, e usar o app fora da sua rede — pelos dados móveis, com o Wi-Fi
desligado. Login, timeline, criar evento e uma rota de IA. É o único jeito de saber que o
caminho inteiro funciona.

Por fim, confirme no VictoriaLogs que as requisições do celular aparecem **sem** token,
sem cabeçalho de autorização e sem dado pessoal.

## 6. Armadilhas comuns

**Rate limit contando o IP errado.** Se houver Cloudflare ou qualquer proxy na frente,
todas as requisições chegam com o mesmo IP de origem e o rate limit ou não pega ninguém ou
pega todo mundo de uma vez. É preciso confiar no header de IP real — e confiar nele
**só** vindo do proxy, senão qualquer um forja.

**CORS curinga com credenciais.** Descrito em 3.3.

**Achar que CORS protege a API.** Ele é uma regra de navegador. `curl`, um script ou o app
Expo nativo ignoram completamente. Quem protege é a autenticação.

**Certificado emitido para o host errado.** `api.SEUDOMINIO.com` precisa do próprio
`Certificate`. Um Ingress apontando para o Secret TLS do host do web dá erro de nome no
app — e o Expo às vezes engole esse erro de um jeito que parece problema de rede.

**HSTS no subdomínio novo.** O `stsIncludeSubdomains` do host principal já cobre
`api.SEUDOMINIO.com`. Se o certificado dele não estiver válido no primeiro acesso, o
navegador recusa — e a Fase 3 já explicou o quanto isso é chato de desfazer.

**Log de acesso crescendo.** Tráfego externo inclui varredura automatizada. Confirme a
retenção de 14 dias da Fase 2 e o alerta de disco.

## 7. Para estudar

- 🆓 [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — API4 (consumo irrestrito de recursos) é exatamente o risco de 3.1.
- 🆓 [MDN — CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) — em especial a seção de requisições com credenciais.
- 🆓 [Traefik — Middlewares: RateLimit e Buffering](https://doc.traefik.io/traefik/middlewares/http/ratelimit/)
- 🆓 [Firebase — Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- 🆓 [Expo — Environment variables e app config](https://docs.expo.dev/guides/environment-variables/)
