---
status: accepted
date: 2026-11-27
---

# O auth em SQLite, com os dados de acesso copiados do Postgres

## Contexto

A [ADR 0024](./0024-api-em-sqlite-sem-orm.md) levou a API para SQLite e deixou o auth no Postgres para um passo
próprio, porque ele concentra os riscos de segurança: sessões e refresh tokens com `FOR UPDATE`, advisory locks no
bootstrap do admin, na rotação de chave e na limpeza, o papel `auth_runtime` que só insere no `audit_log`, e CLIs que
escrevem no mesmo banco que o servidor. O auth não usa Drizzle em tempo de execução: são cerca de 1.200 linhas de SQL à
mão sobre uma interface pequena, `query(texto, valores)` no estilo do `pg`.

Ao contrário da API, o auth tem dados que não convém perder: o hash da senha de cada usuário, os papéis, a chave de
dispositivo do transcriber e as chaves de assinatura dos tokens.

## Decisão

1. **O auth guarda tudo num arquivo SQLite** (`AUTH_DATABASE_PATH`; em produção `/data/auth.sqlite` no volume
   `auth-data`, localmente `.data/auth.sqlite` em cada worktree). Com isso nenhum serviço usa mais o Postgres.
2. **O cliente SQLite vira o pacote `@repo/sqlite`**, dividido com a API: template `sql`, codecs, escritor único com
   `BEGIN IMMEDIATE` e o migrador de arquivos SQL com registro por checksum. A abertura com migração e cópia antes de
   migrar também vai para o pacote.
3. **A interface do banco do auth não muda.** O adaptador mantém `query(texto, $1...)` e `{ rows, rowCount }`, grava
   `Date`, booleano, lista e objeto como o `pg` gravava, e devolve cada coluna pelo tipo declarado na migration
   (`TIMESTAMP_TEXT` vira `Date`, `JSON_TEXT` vira objeto ou lista, `BOOLEAN` vira `boolean`). Os repositórios mudam só
   no dialeto. Toda consulta vai pelo escritor: o auth é pequeno, e uma leitura logo depois de uma escrita nunca vê o
   estado anterior.
4. **Travas.** Saem `FOR UPDATE`, `FOR KEY SHARE` e os advisory locks: a transação abre com `BEGIN IMMEDIATE` e já tem o
   lock de escrita do arquivo, também entre o servidor e os CLIs (com `busy_timeout`). A limpeza deixa de desistir
   quando outra está rodando: ela espera a outra terminar e só vê o que sobrou.
5. **Garantias que eram do Postgres.** O `audit_log` só cresce por triggers que recusam UPDATE e DELETE para qualquer
   conexão (no lugar do papel `auth_runtime`). Um trigger confere que `sessions.amr` só tem métodos conhecidos (o CHECK
   não aceita subconsulta). A regex das permissões vira a lista fechada delas. O refresh token continua valendo
   exatamente 30 dias pelo CHECK.
6. **Os dados de acesso são copiados uma vez.** `db:copy-from-postgres` lê do Postgres antigo e grava no SQLite numa
   transação só: usuários, papéis, permissões, chaves de dispositivo, chaves de assinatura e auditoria. Sessões,
   refresh tokens, convites e contadores de tentativa ficam de fora. Um arquivo que já tem usuários é recusado. O
   primeiro deploy roda a cópia sozinho dentro do pod, enquanto o Postgres existir, e reinicia o auth.
7. **Migrations na subida.** Como a API, o auth aplica as migrations ao abrir o banco, depois de copiar o arquivo. A
   versão do schema continua em `auth_schema_meta` (a 9 é a primeira em SQLite) e o `/health/ready` continua
   conferindo-a.

## Consequências

- Some a separação entre credencial de migração e de execução: quem acessa o volume acessa o banco inteiro. O que o
  papel `auth_runtime` protegia de mais importante, a auditoria só de inserção, fica com os triggers.
- O auth não escala para mais de uma réplica: `strategy: Recreate` e volume `ReadWriteOnce`.
- O `pg` continua como dependência do auth só para a cópia única; sai quando o Postgres for desligado.
- O Postgres de produção fica parado depois da virada, com os bancos `braid` e `braid_auth` como arquivo histórico, e
  o `backup.sh` continua guardando o `braid_auth` até ele ser desligado num passo à parte.
- Os testes de integração e o e2e não precisam mais de Docker.
