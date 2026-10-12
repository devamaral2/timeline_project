# Confirmar o roteamento Cloudflare → Traefik → Auth → API

Este documento verifica, de ponta a ponta, que uma requisição pública para
`api.SEUDOMINIO` passa primeiro pelo Auth e que o Service da API não está
exposto diretamente fora do cluster.

O procedimento foi escrito para a infraestrutura deste projeto:

- VPS: `179.199.138.185`;
- Kubernetes: k3s;
- namespace da aplicação: `braid`;
- namespace do conector Cloudflare: `edge`;
- proxy interno: Traefik;
- exposição pública: Cloudflare Tunnel;
- Service do Auth: `auth:3002`;
- Service da API: `api:3001`.

Não copie valores de Secrets para o terminal ou para este documento. Os comandos
abaixo não precisam exibir tokens, senhas ou a `AUTH_INTERNAL_SERVICE_KEY`.

## 1. Resultado que deve ser comprovado

O fluxo público correto é:

```text
Cliente
  │ HTTPS para api.SEUDOMINIO
  ▼
Cloudflare
  │ Cloudflare Tunnel
  ▼
cloudflared no namespace edge
  │ HTTP interno para traefik.kube-system.svc.cluster.local:80
  │ Host: api.SEUDOMINIO
  ▼
Traefik
  │ Ingress de api.SEUDOMINIO aponta para auth:3002
  ▼
Auth
  │ 1. valida o Bearer token
  │ 2. verifica permissões
  │ 3. adiciona a identidade e a chave interna do gateway
  ▼
API em api.braid.svc.cluster.local:3001
```

O fluxo de `auth.SEUDOMINIO` é:

```text
Cliente
  → Cloudflare
  → Cloudflare Tunnel
  → Traefik
  → auth:3002
  → login, refresh, logout, JWKS, health e demais rotas do Auth
```

`api.SEUDOMINIO` não redireciona o navegador para `auth.SEUDOMINIO`. Não deve
existir resposta HTTP 301, 302, 307 ou 308 entre esses hostnames. Os dois chegam
ao mesmo Service `auth`, e o Auth encaminha internamente apenas as rotas `/api/*`
para a API.

## 2. Antes de começar

Tenha disponíveis:

- acesso ao painel Cloudflare da zona;
- um terminal conectado à VPS com permissão de `sudo`;
- um terminal no seu computador local;
- o domínio real usado pela aplicação.

Nos exemplos, substitua `seudominio.com` pelo domínio real. Não escreva as
aspas angulares e não acrescente `https://` na variável `DOMAIN`.

### 2.1. Preparar o terminal da VPS

Conecte à VPS no terminal em que o acesso já funciona. Depois execute:

```bash
sudo -i
```

Carregue a configuração operacional existente:

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

```bash
source /opt/braid/env.sh
```

Confira somente o domínio, sem imprimir outros valores do arquivo:

```bash
printf 'DOMAIN=%s\n' "$DOMAIN"
```

Se `DOMAIN` estiver vazio, defina-o apenas para esta sessão:

```bash
export DOMAIN="seudominio.com"
```

### 2.2. Preparar o terminal do computador local

No computador local, execute:

```bash
export DOMAIN="seudominio.com"
```

```bash
export VPS_IP="179.199.138.185"
```

Os comandos identificados como **VPS** devem ser executados na VPS. Os comandos
identificados como **computador local** devem ser executados fora da VPS.

## 3. Confirmar que a instalação usa Cloudflare Tunnel

Não altere registros DNS antes desta verificação. Esta instalação foi projetada
para usar Cloudflare Tunnel, não registros `A` direcionados à VPS.

### 3.1. Verificar o conector no k3s

**VPS:**

```bash
kubectl -n edge get deployment cloudflared
```

Resultado esperado:

```text
NAME          READY   UP-TO-DATE   AVAILABLE
cloudflared   1/1     1            1
```

Confira o pod:

```bash
kubectl -n edge get pods -l app=cloudflared -o wide
```

O pod deve estar `Running` e `READY 1/1`.

Confira as mensagens recentes sem exibir o token:

```bash
kubectl -n edge logs deployment/cloudflared --tail=80
```

Procure mensagens de conexões registradas/estabelecidas. Não devem existir
erros repetidos de autenticação, `Unauthorized`, `1033` ou reinicializações.

Confira o Secret apenas pelo nome e pelas chaves, sem decodificá-lo:

```bash
kubectl -n edge get secret cloudflared-token
```

Se o deployment não existir, pare aqui. Não troque o DNS para o IP da VPS.
Primeiro restaure o conector seguindo o runbook `deploy-k3s.md`.

### 3.2. Verificar o Tunnel no painel Cloudflare

**Navegador:**

1. Entre em [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Se estiver no painel **Cloudflare One / Zero Trust**, clique em **Back to
   ...** para retornar ao painel da conta.
3. Abra **Networking → Tunnels**. Em algumas versões da interface, o caminho
   equivalente aparece como **Networks → Tunnels & Mesh**.
4. Abra o Tunnel chamado `timeline-vps`.
5. Confirme que o status do conector é **Healthy**.
6. Não recrie o Tunnel e não gere outro token se ele já estiver Healthy.

Se o painel mostrar `Down` ou `Inactive`, volte à VPS e examine:

```bash
kubectl -n edge get pods -l app=cloudflared
```

```bash
kubectl -n edge logs deployment/cloudflared --tail=150
```

## 4. Conferir os Published Hostnames do Tunnel

Esta é a configuração mais importante na Cloudflare.

**Navegador:** dentro do Tunnel `timeline-vps`:

1. Abra **Routes**.
2. Abra a área de **Published application routes**. Em interfaces antigas, a
   aba é chamada **Public Hostnames**.
3. Localize a rota de `api.SEUDOMINIO`.
4. Clique em **Edit** e compare todos os campos com a tabela abaixo.
5. Faça o mesmo para `auth.SEUDOMINIO`.

As duas rotas devem ser:

| Campo            | Rota da API                                | Rota do Auth                               |
| ---------------- | ------------------------------------------ | ------------------------------------------ |
| Subdomain        | `api`                                      | `auth`                                     |
| Domain           | domínio real                               | domínio real                               |
| Path             | vazio                                      | vazio                                      |
| Service type     | `HTTP`                                     | `HTTP`                                     |
| URL              | `traefik.kube-system.svc.cluster.local:80` | `traefik.kube-system.svc.cluster.local:80` |
| HTTP Host Header | `api.SEUDOMINIO`                           | `auth.SEUDOMINIO`                          |

Para encontrar o campo de Host Header:

1. Abra **Additional application settings**.
2. Abra **HTTP settings**.
3. Localize **HTTP Host Header**.
4. Na rota `api`, escreva o hostname completo `api.SEUDOMINIO`.
5. Na rota `auth`, escreva o hostname completo `auth.SEUDOMINIO`.
6. Salve a rota.

Não use nenhuma destas configurações:

- URL `localhost:80`;
- URL `179.199.138.185:80`;
- URL direta `api.braid.svc.cluster.local:3001`;
- URL direta `auth.braid.svc.cluster.local:3002`;
- rota curinga `*.SEUDOMINIO`;
- Path `/api` na rota publicada;
- `No TLS Verify`.

O Tunnel deve entregar tudo ao Traefik. O Traefik é o responsável por decidir
qual Service recebe cada hostname.

O tipo `HTTP` da rota é intencional. O navegador continua conectado à
Cloudflare por HTTPS. O trecho `cloudflared → Traefik` fica dentro do cluster,
e a conexão entre a Cloudflare e o conector pertence ao Tunnel cifrado.

Referências oficiais:

- [Publicar aplicações pelo Tunnel](https://developers.cloudflare.com/tunnel/get-started/)
- [Parâmetros da origem](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/)

## 5. Conferir o DNS administrado pelo Tunnel

**Navegador:** volte à zona do domínio e abra **DNS → Records**.

Para `api` e `auth`, confirme:

- o registro está associado ao Tunnel;
- o destino é semelhante a `<UUID>.cfargotunnel.com`;
- o proxy está ativo;
- não existe registro `A` paralelo apontando para `179.199.138.185`;
- não existe registro `AAAA` paralelo apontando para o IPv6 da VPS;
- não existem dois registros concorrentes para o mesmo hostname.

O painel pode apresentar esses registros como CNAME gerenciados pelo Tunnel.
Não substitua esses CNAMEs por registros `A`.

Se houver um `A` ou `AAAA` antigo para `api` ou `auth`, faça antes uma captura
de tela ou registre seu conteúdo. Remova somente o registro antigo que conflita
com a rota do Tunnel. Não remova MX, TXT ou registros de outros subdomínios.

**Computador local:**

```bash
dig +short "api.$DOMAIN"
```

```bash
dig +short "auth.$DOMAIN"
```

É normal receber IPs anycast da Cloudflare. Não é esperado receber diretamente
`179.199.138.185`.

Registros proxied fazem o tráfego HTTP/HTTPS passar pela rede da Cloudflare em
vez de expor diretamente o destino configurado no DNS. Consulte
[Proxy status](https://developers.cloudflare.com/dns/proxy-status/).

## 6. Conferir SSL/TLS da zona Cloudflare

Mesmo usando Tunnel, mantenha uma política TLS segura para os visitantes. Nesta
arquitetura há três trechos diferentes:

1. navegador → borda da Cloudflare: HTTPS público;
2. borda da Cloudflare → `cloudflared`: Tunnel criptografado;
3. `cloudflared` → Traefik dentro do cluster: HTTP definido pela `Service URL`.

O modo SSL/TLS da zona não troca o protocolo do terceiro trecho. Como as rotas
publicadas usam `http://traefik.kube-system.svc.cluster.local:80`, selecionar
`Full (strict)` não adiciona TLS entre `cloudflared` e Traefik. Para isso seria
necessário configurar a rota com uma `Service URL` HTTPS e validar o certificado
da origem separadamente.

**Navegador:**

1. Abra **SSL/TLS → Overview**.
2. Mantenha **Automatic SSL/TLS (recommended)**. Se o painel mostrar
   **Currently running: Full** ou **Full (strict)**, a configuração é compatível
   com este Tunnel.
3. Abra **SSL/TLS → Edge Certificates**.
4. Confirme que **Universal SSL** está ativo.
5. Ative **Always Use HTTPS**.
6. Defina **Minimum TLS Version** como TLS 1.2 ou superior.

Não selecione manualmente `Flexible` nem `Off`. `Full (strict)` também pode ser
usado, mas não é obrigatório para as rotas HTTP deste Tunnel. Ele passa a ser
relevante para uma origem HTTPS tradicional ou para outros hostnames da zona:
além de exigir HTTPS até a origem, valida validade, autoridade emissora e nome do
certificado apresentado por ela.

Não configure redirecionamento HTTP→HTTPS no Traefik interno. O HTTPS público
termina na borda da Cloudflare, e o Tunnel entrega HTTP internamente ao Traefik.

Referência oficial:

- [Modos de criptografia SSL/TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
- [HTTPS origins com Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/)

## 7. Remover interferências de regras Cloudflare

As verificações abaixo impedem que uma regra da Cloudflare mude o hostname ou
intercepte a autenticação antes de a requisição chegar ao Auth da aplicação.

### 7.1. Redirect Rules

**Navegador:**

1. Abra **Rules → Redirect Rules**.
2. Examine regras ativas e drafts.
3. Confirme que nenhuma regra corresponde a `api.SEUDOMINIO` ou
   `auth.SEUDOMINIO` e redireciona um para o outro.
4. Também confira **Bulk Redirects** e Page Rules antigas, caso apareçam na zona.

Não crie um redirect `api → auth`. Os dois hostnames permanecem visíveis para o
cliente e são encaminhados internamente ao mesmo Service.

### 7.2. Origin Rules e Transform Rules

1. Abra **Rules → Origin Rules**.
2. Confirme que nenhuma regra para `api` ou `auth` altera o DNS de destino,
   Host Header, SNI ou porta.
3. Abra **Rules → Transform Rules**.
4. Confirme que nenhuma regra reescreve o path `/api/*` ou remove o header
   `Authorization`.

Origin Rules podem alterar destino, porta, Host e SNI. Nesta arquitetura essas
decisões pertencem ao Tunnel e ao Traefik.

Referência oficial:

- [Origin Rules](https://developers.cloudflare.com/rules/origin-rules/)

### 7.3. Workers Routes

1. Abra **Workers & Pages**.
2. Examine **Workers Routes**.
3. Confirme que não existe route `api.SEUDOMINIO/*` ou
   `auth.SEUDOMINIO/*`, a menos que esse Worker seja intencional e conhecido.

Um Worker inesperado pode devolver respostas sem que a requisição alcance a VPS.

### 7.4. Cloudflare Access

Pelo desenho atual descrito neste documento, usuários e clientes precisam
alcançar tanto a API quanto as rotas públicas de autenticação. Portanto:

- não deve existir uma aplicação Access cobrindo todo `api.SEUDOMINIO/*`;
- não deve existir uma aplicação Access cobrindo todo `auth.SEUDOMINIO/*`;
- Access pode continuar protegendo painéis administrativos como Grafana e
  RabbitMQ.

Para verificar:

1. Abra **Zero Trust → Access → Applications**.
2. Procure aplicações cujos domínios sejam `api.SEUDOMINIO` ou
   `auth.SEUDOMINIO`.
3. Se encontrar uma aplicação cobrindo o hostname inteiro, registre a
   configuração antes de alterar.
4. Remova ou desative essa cobertura somente depois de confirmar que ela não é
   uma exigência de segurança deliberada da equipe.

Se um `curl` para a API receber `302` para um hostname `cloudflareaccess.com`,
ou uma página HTML de login Cloudflare, o Access ainda está interceptando a
requisição.

> O runbook antigo `deploy-k3s.md` orientava proteger todo o hostname do Auth
> com Access. Essa regra é incompatível com o Auth como endpoint público de
> login para clientes que não possuem sessão Cloudflare Access. Mantenha Access
> nos painéis administrativos, não nas rotas públicas do aplicativo.

### 7.5. Cache Rules

Crie uma regra explícita para impedir cache de respostas autenticadas.

Essa configuração pertence à zona do domínio, não ao painel Cloudflare One / Zero
Trust. Se o menu lateral mostrar **Access controls**, primeiro clique em **Back
to ...** no canto superior esquerdo, abra **Websites** e selecione a zona do
domínio.

1. Dentro da zona do domínio, abra **Cache → Cache Rules**. Algumas versões da
   interface exibem **Caching → Cache Rules**.
2. Se houver abas, selecione **Cache Rules**, não **Cache Response Rules**.
3. Clique em **Create rule**.
4. Nomeie a regra `Bypass Braid Auth and API`.
5. Escolha **Custom filter expression**.
6. Abra **Edit expression**.
7. Use a expressão abaixo, substituindo o domínio:

```text
(http.host eq "api.seudominio.com") or (http.host eq "auth.seudominio.com")
```

8. Em **Cache eligibility**, escolha **Bypass cache**.
9. Salve e publique a regra.
10. Se houver várias Cache Rules, deixe esta depois de regras que possam marcar
    esses hostnames como cacheáveis.

Referências oficiais:

- [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Configuração Bypass cache](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)

### 7.6. WebSockets

1. Abra **Network** na zona Cloudflare.
2. Localize **WebSockets**.
3. Deixe a opção em **On**.

Isso é necessário para os recursos de chat em tempo real da API.

Referência oficial:

- [WebSockets na Cloudflare](https://developers.cloudflare.com/network/websockets/)

## 8. Confirmar que os Services do Kubernetes são internos

**VPS:** liste os Services principais:

```bash
kubectl -n braid get svc api auth web -o wide
```

Resultado esperado:

```text
NAME   TYPE        PORT(S)
api    ClusterIP   3001/TCP
auth   ClusterIP   3002/TCP
web    ClusterIP   3000/TCP
```

Confirme a API de forma objetiva:

```bash
kubectl -n braid get svc api -o jsonpath='{.spec.type}{"\n"}{.spec.ports[*].port}{"\n"}{.spec.ports[*].nodePort}{"\n"}'
```

Resultado esperado:

```text
ClusterIP
3001

```

A terceira linha deve estar vazia. Se aparecer um número, existe um NodePort.
Não continue considerando a API isolada até esse NodePort ser removido.

Confirme o Auth:

```bash
kubectl -n braid get svc auth -o jsonpath='{.spec.type}{"\n"}{.spec.ports[*].port}{"\n"}{.spec.ports[*].nodePort}{"\n"}'
```

Resultado esperado:

```text
ClusterIP
3002

```

Confirme o Traefik:

```bash
kubectl -n kube-system get svc traefik -o wide
```

Nesta instalação com Tunnel, o Traefik também deve ser `ClusterIP`. Ele não
precisa de `EXTERNAL-IP`, NodePort ou LoadBalancer público.

Liste qualquer Service potencialmente público:

```bash
kubectl get svc -A | grep -E 'NodePort|LoadBalancer' || true
```

Analise qualquer linha retornada. O resultado ideal desta instalação é nenhuma
exposição pública desnecessária.

## 9. Confirmar que o Ingress da API aponta para o Auth

O Tunnel entrega a requisição ao Traefik. Este passo confirma a decisão seguinte.

### 9.1. Listar as rotas

**VPS:**

```bash
kubectl get ingress -A -o wide
```

Mostre cada hostname e backend de Ingress em uma tabela:

```bash
kubectl get ingress -A -o json | jq -r '.items[] | .metadata.namespace as $namespace | .metadata.name as $ingress | .spec.rules[]? | .host as $host | .http.paths[]? | [$namespace,$ingress,$host,.backend.service.name,(.backend.service.port.number|tostring)] | @tsv'
```

Para os hostnames públicos, o resultado correto é:

```text
braid   api    api.SEUDOMINIO    auth    3002
braid   auth   auth.SEUDOMINIO   auth    3002
```

O resultado incorreto seria:

```text
braid   api    api.SEUDOMINIO    api     3001
```

Confira o YAML completo do Ingress da API:

```bash
kubectl -n braid get ingress api -o yaml
```

O trecho decisivo deve ser:

```yaml
rules:
  - host: api.SEUDOMINIO
    http:
      paths:
        - path: /
          pathType: Prefix
          backend:
            service:
              name: auth
              port:
                number: 3002
```

Confira também o Auth:

```bash
kubectl -n braid get ingress auth -o yaml
```

Ele também deve usar `name: auth` e `number: 3002`.

### 9.2. Corrigir o Ingress da API somente se estiver errado

Não execute esta seção se o Ingress já aponta para `auth:3002`.

Primeiro, salve o estado atual para rollback:

```bash
kubectl -n braid get ingress api -o yaml > /root/ingress-api-before-auth-gateway.yaml
```

Confira se existe um manifesto persistente:

```bash
ls -l /opt/braid/k8s/ingress-api.yaml
```

Abra o manifesto:

```bash
nano /opt/braid/k8s/ingress-api.yaml
```

Mantenha metadata, annotations, `ingressClassName`, host, path e quaisquer
outros campos existentes. Altere somente o backend para:

```yaml
backend:
  service:
    name: auth
    port:
      number: 3002
```

Salve no `nano` com `Ctrl+O`, pressione `Enter` e saia com `Ctrl+X`.

Valide o arquivo sem aplicar:

```bash
kubectl apply --dry-run=server -f /opt/braid/k8s/ingress-api.yaml
```

Se não houver erro, aplique:

```bash
kubectl apply -f /opt/braid/k8s/ingress-api.yaml
```

Confira novamente:

```bash
kubectl -n braid get ingress api -o yaml
```

Se a alteração causar um comportamento inesperado, faça rollback:

```bash
kubectl apply -f /root/ingress-api-before-auth-gateway.yaml
```

Depois restaure também o arquivo persistente antes do próximo deploy.

## 10. Testar Traefik e Auth por dentro da VPS

Estes testes não passam pela Cloudflare. Eles isolam o roteamento interno.

### 10.1. Obter o IP interno do Traefik

**VPS:**

```bash
TRAEFIK_IP=$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
```

```bash
printf 'TRAEFIK_IP=%s\n' "$TRAEFIK_IP"
```

### 10.2. Provar que api.SEUDOMINIO chega ao Auth

Envie o hostname da API para o endpoint de health que existe no Auth:

```bash
curl -sS -o /dev/null -w 'status=%{http_code}\n' -H "Host: api.$DOMAIN" "http://$TRAEFIK_IP/health/ready"
```

Resultado esperado:

```text
status=200
```

Esse é o teste mais direto do backend do Ingress: `/health/ready` existe no
Auth. Se `api.SEUDOMINIO/health/ready` retorna 200 pelo Traefik, o hostname da
API está chegando ao Auth.

Teste uma rota protegida:

```bash
curl -sS -o /dev/null -w 'status=%{http_code}\n' -H "Host: api.$DOMAIN" "http://$TRAEFIK_IP/api/events"
```

Resultado esperado sem token:

```text
status=401
```

Um `401` é sucesso neste teste: o Auth recebeu a requisição e recusou a ausência
do Bearer token.

### 10.3. Testar auth.SEUDOMINIO

```bash
curl -sS -o /dev/null -w 'status=%{http_code}\n' -H "Host: auth.$DOMAIN" "http://$TRAEFIK_IP/health/ready"
```

Resultado esperado:

```text
status=200
```

Confira o JWKS público:

```bash
curl -fsS -H "Host: auth.$DOMAIN" "http://$TRAEFIK_IP/.well-known/jwks.json" | jq -e '.keys | length > 0'
```

Resultado esperado:

```text
true
```

### 10.4. Provar que a API recusa acesso interno sem o gateway

Faça uma chamada diretamente ao Service da API, sem a chave interna:

```bash
kubectl -n braid exec deployment/auth -- node -e 'fetch("http://api:3001/api/events").then(r=>console.log(r.status)).catch(e=>{console.error(e);process.exit(1)})'
```

Resultado esperado:

```text
401
```

Isso prova que até uma chamada interna precisa da identidade adicionada pelo
Auth gateway. Não tente passar manualmente `x-auth-gateway-key` e não imprima a
chave interna.

## 11. Confirmar que a VPS não expõe portas web ou dos apps

Com Cloudflare Tunnel, a conexão é iniciada de dentro da VPS para a Cloudflare.
As portas 80 e 443 da VPS não precisam ficar abertas para a internet.

### 11.1. Verificar sockets na VPS

**VPS:**

```bash
ss -lntp | grep -E ':(80|443|3001|3002)\b' || true
```

Não deve existir aplicação ouvindo publicamente em:

- `0.0.0.0:80`;
- `0.0.0.0:443`;
- `0.0.0.0:3001`;
- `0.0.0.0:3002`.

Os Services Kubernetes continuam acessíveis pelos IPs e nomes internos do
cluster. Isso não equivale a exposição pública.

### 11.2. Verificar firewall

Se a VPS usa UFW:

```bash
ufw status numbered
```

Não deve existir regra pública permitindo `80`, `443`, `3001` ou `3002`.

Se UFW estiver inativo, confira nftables:

```bash
nft list ruleset
```

Não altere o firewall enquanto uma sessão SSH crítica for a única forma de
acesso. Nunca remova a regra da porta SSH usada pelo servidor.

### 11.3. Testar do computador local

**Computador local:**

```bash
nc -vz -w 5 "$VPS_IP" 80
```

```bash
nc -vz -w 5 "$VPS_IP" 443
```

```bash
nc -vz -w 5 "$VPS_IP" 3001
```

```bash
nc -vz -w 5 "$VPS_IP" 3002
```

Os quatro testes devem falhar com `timed out` ou `connection refused`.

A porta SSH usada pelo deploy pode continuar acessível; ela não faz parte do
fluxo HTTP da aplicação.

## 12. Testar o caminho público completo

Faça estes testes no computador local, não dentro da VPS.

### 12.1. Provar que a Cloudflare está atendendo

**Computador local:**

```bash
curl -sS -D - -o /dev/null "https://api.$DOMAIN/health/ready"
```

Resultado esperado:

- status HTTP `200`;
- header `server: cloudflare`;
- header `cf-ray`;
- nenhum header `Location`;
- `cf-cache-status` igual a `DYNAMIC` ou `BYPASS`, quando presente.

Esse único teste percorre:

```text
computador → Cloudflare → Tunnel → cloudflared → Traefik → Auth
```

### 12.2. Provar que a API exige autenticação

```bash
curl -sS -D - -o /dev/null "https://api.$DOMAIN/api/events"
```

Resultado esperado sem token:

- status `401`;
- nenhum `Location: https://auth...`;
- nenhuma página HTML de Cloudflare Access;
- nenhum status `301`, `302`, `307` ou `308` para o Auth.

### 12.3. Provar que o hostname do Auth funciona

```bash
curl -sS -D - -o /dev/null "https://auth.$DOMAIN/health/ready"
```

Resultado esperado: status `200`.

```bash
curl -fsS "https://auth.$DOMAIN/.well-known/jwks.json" | jq -e '.keys | length > 0'
```

Resultado esperado:

```text
true
```

### 12.4. Testar uma sessão real

Depois dos testes sem token:

1. Abra a aplicação Web em uma janela normal.
2. Faça login com um usuário válido.
3. Abra as ferramentas de desenvolvedor do navegador.
4. Selecione a aba **Network**.
5. Crie ou consulte um evento.
6. Localize a chamada `/api/...`.
7. Confirme que ela não recebeu redirect para `auth.SEUDOMINIO`.
8. Confirme que a operação terminou com status `2xx`.
9. Recarregue a página e confirme que o dado persiste.

Se o mobile usa `api.SEUDOMINIO`, repita no mobile uma operação autenticada de
leitura e uma de escrita depois de qualquer alteração no Ingress.

## 13. Conferir logs durante um teste

Use dois terminais conectados à VPS.

No primeiro terminal:

```bash
kubectl -n edge logs deployment/cloudflared --follow --tail=20
```

No segundo terminal:

```bash
kubectl -n braid logs deployment/auth --follow --tail=50
```

No computador local, repita:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "https://api.$DOMAIN/api/events"
```

Pressione `Ctrl+C` nos terminais de logs depois do teste. Não deixe sessões de
log abertas indefinidamente.

O código esperado sem token é `401`. A ausência de logs de request no Auth não
prova falha: a aplicação pode não registrar toda requisição. As definições do
Ingress e o teste de `/health/ready` continuam sendo a evidência principal.

## 14. Interpretação dos resultados

| Resultado                               | Significado provável                         | Ação                                              |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `api/health/ready` retorna 200          | `api.SEUDOMINIO` chegou ao Auth              | Continue os testes                                |
| `/api/events` retorna 401 sem token     | Auth protegeu a rota                         | Resultado correto                                 |
| `/api/events` retorna 200 sem token     | Falha crítica de autenticação ou cache       | Pare e examine Auth, Cloudflare e cache           |
| Resposta 301/302 para `auth.SEUDOMINIO` | Existe redirect indevido                     | Revise Redirect Rules e Traefik                   |
| Resposta 302 para Cloudflare Access     | Access cobre API/Auth                        | Remova ou restrinja a aplicação Access            |
| Cloudflare 1033                         | Tunnel sem conector saudável                 | Verifique deployment e logs do cloudflared        |
| Cloudflare 502                          | Tunnel conectado, origem interna inacessível | Verifique URL da rota e Service Traefik           |
| Traefik 404                             | Host Header ou regra de Ingress incorretos   | Compare Published Hostname e Ingress              |
| `api` é NodePort/LoadBalancer           | API possui exposição adicional               | Troque para ClusterIP após revisar consumidores   |
| Porta 3001 responde pelo IP público     | API está exposta fora do cluster             | Revise Service, host networking e firewall        |
| Porta 80/443 da VPS responde            | O origin também está público                 | Revise firewall; Tunnel não precisa dessas portas |
| Resposta `cf-cache-status: HIT` na API  | Resposta da API foi cacheada                 | Corrija a Cache Rule imediatamente                |

## 15. Evidências que devem ser guardadas

Sem registrar Secrets, guarde as seguintes evidências no chamado ou relatório
de infraestrutura:

1. captura das duas Published application routes do Tunnel;
2. captura dos registros DNS `api` e `auth`;
3. saída de `kubectl -n edge get deployment cloudflared`;
4. saída de `kubectl -n braid get svc api auth web -o wide`;
5. saída da tabela de Ingress gerada com `jq`;
6. status de `api/health/ready`;
7. status de `api/api/events` sem token;
8. resultado dos testes externos das portas 80, 443, 3001 e 3002;
9. confirmação de que Cache Rule e WebSockets estão configurados;
10. confirmação de que Cloudflare Access não intercepta API/Auth.

Não guarde:

- token do Tunnel;
- conteúdo de Kubernetes Secrets;
- JWT de usuário;
- chave SSH;
- `AUTH_INTERNAL_SERVICE_KEY`;
- URLs de banco com senha.

## 16. Checklist final

Marque cada item somente depois de verificá-lo:

- [ ] Deployment `cloudflared` está `1/1` e o Tunnel está Healthy.
- [ ] Rota publicada `api.SEUDOMINIO` aponta para o Traefik interno.
- [ ] Rota publicada `auth.SEUDOMINIO` aponta para o Traefik interno.
- [ ] Cada rota preserva o HTTP Host Header correto.
- [ ] DNS de `api` e `auth` pertence ao Tunnel, sem `A/AAAA` concorrente.
- [ ] Não existe redirect Cloudflare entre `api` e `auth`.
- [ ] Origin Rules, Transform Rules e Workers não mudam esse fluxo.
- [ ] Cloudflare Access não intercepta os endpoints públicos do aplicativo.
- [ ] Cache está em Bypass para `api` e `auth`.
- [ ] WebSockets está ativado.
- [ ] Service `api` é `ClusterIP:3001`, sem NodePort.
- [ ] Service `auth` é `ClusterIP:3002`, sem NodePort.
- [ ] Service `traefik` é interno.
- [ ] Ingress `api.SEUDOMINIO` aponta para `auth:3002`.
- [ ] Ingress `auth.SEUDOMINIO` aponta para `auth:3002`.
- [ ] Nenhum Ingress público aponta para `api:3001`.
- [ ] `api.SEUDOMINIO/health/ready` retorna 200.
- [ ] `api.SEUDOMINIO/api/events` sem token retorna 401.
- [ ] Acesso direto interno a `api:3001` sem gateway retorna 401.
- [ ] Portas públicas 80, 443, 3001 e 3002 da VPS estão fechadas.
- [ ] Login e uma operação real autenticada funcionam.
- [ ] O mobile continua funcionando, se ele consumir esses hostnames.

Quando todos os itens estiverem marcados, está comprovado que
`api.SEUDOMINIO` passa pelo Auth antes de chegar à API e que a API não é exposta
diretamente fora da VPS/cluster.

## 17. Observação separada sobre o próximo rollout do Auth

O isolamento de rede não corrige variáveis de ambiente do pod. Antes do próximo
deploy, confira no manifesto versionado que `AUTH_PORT=3002` e
`AUTH_HOST=0.0.0.0` estão no container `auth`, não apenas no container `web`.

O trecho deve ficar dentro de `spec.template.spec.containers` do Deployment
`auth`:

```yaml
- name: auth
  env:
    - { name: AUTH_PORT, value: '3002' }
    - { name: AUTH_HOST, value: '0.0.0.0' }
  envFrom:
    - secretRef: { name: onepassword-loader }
```

Essa verificação evita a repetição do erro `AUTH_PORT: expected number,
received NaN`. Ela é independente do fluxo Cloudflare → Traefik → Auth → API.
