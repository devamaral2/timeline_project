# ADR-109 — API publicada por HTTPS para o app mobile

**Status:** aceita · **Data:** 2026-08-31

## Contexto

O app Expo existe e não alcança o servidor: ele só funciona com `MOBILE_API_URL` apontando
para a máquina de desenvolvimento na rede local. Fora dela, não funciona.

A [Fase 5 do v1](../../docs/07-fase-5-traefik-e-tls.md) adiou isso de propósito e listou o
que faltava — host HTTPS dedicado, CORS allowlist, rate limit próprio, logs sem token,
`MOBILE_API_URL` em HTTPS e teste de abuso — deixando claro que publicar a API *"não é
apenas adicionar um label"*, porque muda o modelo de ameaça.

Desde então mudou uma coisa relevante: as rotas de IA passaram a custar dinheiro por
chamada, com o orçamento controlado pelo [LiteLLM](106-litellm-gateway.md).

## Decisão

Publicar a API em `api.SEUDOMINIO.com`, com Ingress próprio, certificado próprio, CORS em
allowlist, rate limit e limite de corpo com perfil separado do web, e varredura externa
confirmando que nada mais ficou exposto.

**Quota de IA por usuário final fica fora de escopo**, por decisão explícita. No lugar:
rate limit por IP no Traefik, rate limit por usuário autenticado usando o Redis existente,
e alerta quando o gasto do mês passar de metade do orçamento.

## Alternativas consideradas

**Manter tudo passando pelo Next.** O mobile chamaria `app.SEUDOMINIO.com/api/*` e nenhum
host novo existiria — a menor superfície possível. Descartado por dois custos: um salto e
a memória de um pod de Next que não renderiza nada em todo tráfego mobile, e um perfil de
rate limit e de corpo que não serve para o mobile.

**Um gateway de API dedicado.** O desenho correto com vários clientes e várias APIs. Uma
peça inteira para um app e uma API.

**mTLS entre app e API.** Elimina tráfego que não vem do seu app. Descartado porque
distribuir certificado num app publicado é um problema maior que o que resolve.

**Implementar quota por usuário agora.** Seria a resposta completa ao risco abaixo, em vez
da parcial. Ficou fora por decisão de escopo.

## Consequências

**Positivas.** O app mobile passa a funcionar de verdade, fora da rede local. A API ganha
um perfil de proteção próprio em vez de herdar o do web.

**Negativas.** Superfície nova exposta à internet, incluindo varredura automatizada
constante. Access log crescendo. Uma segunda cadeia de certificado para manter.

**Risco declarado e aceito.** As três camadas de teto de custo do LiteLLM são **globais da
aplicação**. Um usuário autenticado que abuse das rotas de IA é contido pelo orçamento
mensal — isto é, **derrubando a funcionalidade para todos até o mês virar**. Nada limita um
usuário individual. Isso é aceitável enquanto os usuários forem pessoas conhecidas.

## Quando revisitar

- **Gatilho principal:** a base de usuários passar de um punhado de pessoas conhecidas.
  Nesse ponto, quota por usuário deixa de ser opcional — e as chaves virtuais do LiteLLM
  são o mecanismo pronto para implementá-la.
- Se o gasto mensal passar de metade do orçamento de forma recorrente.
- Se aparecer abuso real, ainda que de usuário legítimo.
