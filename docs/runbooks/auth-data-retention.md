# Retenção de dados do Auth

O cleanup apaga só o que já cumpriu o próprio tempo de vida de segurança, em
**uma transação**. Se qualquer parte falhar, nada é apagado.

## Executar

Periodicamente, uma instância por banco (um cron diário serve):

```bash
pnpm --filter @repo/auth run cleanup-auth-data
```

A saída é um JSON com as contagens:

```json
{"lockAcquired":true,"sessionsEnded":0,"authenticationAttemptsDeleted":12,
 "mfaChallengesDeleted":12,"rateLimitBucketsDeleted":40,"invitesDeleted":1,
 "recoveryCodesDeleted":0,"sessionsDeleted":3,"signingKeysRetired":1}
```

`lockAcquired: false` com tudo zerado significa que outro cleanup já estava em
execução. **Não é erro** e não houve mutação: rodar duas vezes em paralelo é
seguro, garantido por `pg_try_advisory_xact_lock`. Exit code não-zero significa
que a transação foi revertida por inteiro.

## O que cada prazo cobre

| Dado | Prazo | Contado a partir de |
| --- | --- | --- |
| tentativas de autenticação, desafios de MFA, buckets de rate limit | 24 h | consumo, invalidação ou expiração |
| convites | 30 d | aceite, revogação ou expiração |
| códigos de recuperação | 90 d | uso ou revogação |
| sessões encerradas ou revogadas | 90 d | revogação ou encerramento |
| chaves `retiring` | `retire_after` | rotação |

Sessões sem nenhum refresh token utilizável — todos consumidos ou vencidos —
recebem `ended_at` antes de começarem a contar os 90 dias.

## O que ele nunca apaga

- **Refresh token consumido de uma sessão ainda viva.** É ele que sustenta a
  detecção de reuso: apagá-lo transformaria um token roubado em um token
  simplesmente desconhecido, e a família de sessões não cairia.
- **Linhas de `audit_log`.** A execução só acrescenta: um `key.retired` por
  chave aposentada e um `cleanup.completed` com as contagens.
- **A JWK pública de uma chave aposentada.** Some o material privado, fica a
  parte pública.

## Se falhar

O erro vem do banco e a transação inteira volta atrás — inclusive a
aposentadoria de chave e os `ended_at`. Rode de novo depois de resolver a causa;
a rotina é idempotente e uma segunda execução sem nada a fazer retorna todas as
contagens em zero.
