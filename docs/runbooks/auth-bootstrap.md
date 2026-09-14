# Link de signup de administrador

Não existe cadastro aberto: toda conta nasce de um link de signup, e o link só
sai deste script. Hoje toda conta criada por signup é administradora.

O script cria uma conta-placeholder (`status = pending_sign_up`, nome
`admin_<hash>`, sem email, telefone ou senha) e emite para ela um JWT
`token_use: "signup"` de **uma hora**. O `jti` do token fica em
`signup_tokens` — é isso que torna o link revogável e de uso único. O JWT em si
não é guardado em lugar nenhum.

## Antes

- Banco migrado (`docs/runbooks/auth-database.md`).
- `AUTH_DATABASE_URL`, `AUTH_KEY_ENCRYPTION_KEY`, `AUTH_ISSUER`, `AUTH_AUDIENCE`,
  `AUTH_PUBLIC_URL` e `AUTH_WEB_APP_URL` definidos — os mesmos valores do
  serviço, senão o token emitido não passa na verificação dele.

Não é preciso subir o serviço antes: o script garante a chave de assinatura
ativa sozinho.

## Emitir

```bash
pnpm --filter @repo/auth run bootstrap-admin
```

Saída:

```
outcome=created
userId=01J...
expiresAt=2026-09-13T13:00:00.000Z
link=https://<AUTH_WEB_APP_URL>/signup#token=<jwt>
```

Entregue o `link` por um canal seguro. O token vai no fragmento (`#token=`), que
o navegador não envia ao servidor. Não registre o link em ticket, log ou chat, e
anote o `userId` — é por ele que se reemite.

## Reemitir

O link venceu ou se perdeu? Reemita para o **mesmo** placeholder, em vez de
criar outro (que ficaria órfão):

```bash
pnpm --filter @repo/auth run bootstrap-admin -- --reissue <userId>
```

O link anterior morre no mesmo commit em que o novo nasce.

| Saída | Significado |
| --- | --- |
| `outcome=created` | placeholder e link novos |
| `outcome=reissued` | link novo para o placeholder indicado; o anterior foi revogado |
| `no such pending user` | não há usuário com esse `userId` |
| `user already completed signup; nothing to reissue` | a conta já foi ativada |

Exit code não-zero significa que nada foi gravado.

## Depois

A pessoa abre o link e completa o signup (`POST /auth/signup` com o token no
`Authorization: Bearer`), informando email, telefone, nome e senha. A conta vira
`active`, recebe o papel `admin` e já sai com uma sessão. Dali em diante entra
por `POST /auth/login`.

## Placeholders que nunca completam

Não há job de limpeza: um link que ninguém usa deixa a linha `pending_sign_up`
para sempre (crescimento aceito, TDD §10.4). Para apagar uma à mão:

```sql
DELETE FROM users WHERE id = '<userId>' AND status = 'pending_sign_up';
```

A cascata leva os tokens junto.
