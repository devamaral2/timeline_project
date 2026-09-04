# Bootstrap do primeiro administrador

Com o banco migrado e o serviço parado ou disponível apenas a operadores,
execute uma vez:

```bash
pnpm --filter @repo/auth run bootstrap-admin -- --email admin@example.com --name "Nome"
```

Guarde o link de convite retornado em um canal seguro e entregue-o ao
administrador. O comando é idempotente para o mesmo administrador pendente e
falha se já existir um administrador capaz. Não registre o link nem o token em
tickets, logs ou chat.
