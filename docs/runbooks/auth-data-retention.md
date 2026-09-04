# Retenção de dados do Auth

Execute periodicamente, com uma única instância por banco:

```bash
pnpm --filter @repo/auth run cleanup-auth-data
```

O resultado é JSON com contagens. `lockAcquired: false` significa que outro
cleanup já está em execução e não houve mutação. A rotina é uma transação:
tentativas, desafios e buckets terminados ficam 24 h; convites resolvidos, 30
dias; códigos de recuperação e sessões encerradas/revogadas, 90 dias. Tokens
de refresh consumidos de uma sessão ainda viva são preservados para detectar
reuso. Cada execução registra `cleanup.completed` e cada chave aposentada
registra `key.retired` no log de auditoria.
