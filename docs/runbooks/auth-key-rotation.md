# Rotação da chave de assinatura

Os outros serviços validam o JWT localmente, com a chave pública do JWKS. Por
isso a rotação é feita em três estados, e não de uma vez: trocar a chave sem
período de convivência invalidaria todo access token já emitido.

```
active  →  retiring  →  retired
```

- **active**: assina os tokens novos. Existe uma só, garantida por índice único.
- **retiring**: não assina mais, mas continua publicada no JWKS até
  `retire_after`, para os tokens que ela assinou terminarem de expirar.
- **retired**: material privado apagado; a chave sai do JWKS.

## Antes

- `AUTH_KEY_ENCRYPTION_KEY` é a KEK vigente. É ela que decifra as chaves
  privadas guardadas no banco.
- Banco migrado.

## Executar

```bash
pnpm --filter @repo/auth run rotate-signing-key
```

## Verificar

```bash
curl -fsS http://127.0.0.1:3002/.well-known/jwks.json | jq '.keys | length'
```

Durante a convivência o JWKS publica duas chaves. O `kid` novo aparece nos
tokens emitidos a partir da rotação; consumidores que fazem cache do JWKS
precisam de um refetch ao ver um `kid` desconhecido.

A janela de convivência é `SECURITY_POLICY.signingKeyRetireDelaySeconds`
(1 h e 30 s): a vida do token mais longo que a chave pode ter assinado — os
links de signup e guest, de uma hora — mais folga de relógio.
Depois de `retire_after` a chave `retiring` sai do JWKS sozinha. A aposentadoria
física (apagar o material privado e marcar `retired`) acontece em toda escrita de
chave — no boot do serviço e em cada rotação — ou sob demanda:

```bash
pnpm --filter @repo/auth run retire-signing-keys
```

## O que não fazer

**Nunca troque a `AUTH_KEY_ENCRYPTION_KEY` antes de recriptografar as chaves
existentes.** A KEK nova não decifra o que a antiga cifrou: o serviço sobe, mas
não consegue assinar, e `GET /health/ready` passa a responder 503.

## Emergência: chave privada comprometida

A rotação normal deixa a chave antiga válida por mais uma hora. Se ela vazou,
isso é tempo demais:

1. Rode a rotação.
2. Force a aposentadoria imediata:

   ```sql
   UPDATE signing_keys SET retire_after = now() WHERE status = 'retiring';
   ```

3. Rode `pnpm --filter @repo/auth run retire-signing-keys`, que apaga o material
   privado e imprime os `kid` aposentados.
4. Todo token assinado pela chave antiga passa a falhar na verificação. Os
   usuários continuam com o refresh token válido e recuperam a sessão no
   próximo refresh.
