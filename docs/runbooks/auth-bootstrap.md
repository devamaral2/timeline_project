# Bootstrap do primeiro administrador

O serviço só aceita entrada por convite, e convite só é criado por um
administrador. O bootstrap existe para resolver esse ovo-e-galinha: ele cria o
primeiro administrador e mais ninguém.

## Antes

- Banco migrado (`docs/runbooks/auth-database.md`).
- `AUTH_KEY_ENCRYPTION_KEY` e `AUTH_DATABASE_URL` definidos no ambiente.
- Serviço parado, ou acessível apenas a operadores.

## Executar

```bash
pnpm --filter @repo/auth run bootstrap-admin -- --email admin@example.com --name "Nome"
```

A saída traz o token do convite, uma única vez. O banco guarda apenas o hash:
não há como recuperá-lo depois.

## Entregar o link

Não existe gateway de e-mail no serviço. Monte o link com
`AUTH_WEB_APP_URL` e entregue por um canal seguro:

```
https://<AUTH_WEB_APP_URL>/convites/aceitar#token=<token>
```

O convite vale 7 dias e é de uso único. Não registre o link nem o token em
ticket, log ou chat.

## Desfechos

| Saída | Significado | O que fazer |
| --- | --- | --- |
| `created` | administrador criado | entregue o link |
| `reissued` | já havia um admin pendente com esse e-mail | entregue o link novo; o anterior morreu |
| `already_initialized` | já existe administrador ativo | use `POST /auth/admin/invites` com o token dele |
| `conflicting_pending_admin` | há um admin pendente com **outro** e-mail | resolva aquele convite antes |

Exit code não-zero significa que nada foi gravado.

## Depois

O administrador aceita o convite em `/auth/invites/accept`, verifica o código
em `/auth/mfa/verify` e recebe ali — uma única vez — os dez códigos de
recuperação. Sem eles, perder o telefone tranca a conta para fora.
