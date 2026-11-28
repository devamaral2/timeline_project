---
status: accepted
date: 2026-11-27
---

# A API em SQLite, com SQL à mão no lugar do Drizzle

## Contexto

O banco da API é um Postgres com Drizzle e `pg`. O volume é o de um app pessoal: poucos usuários, poucos milhares de
linhas, uma réplica da API em produção e o worker de jobs de IA no mesmo processo. O Postgres pesa na operação (um
StatefulSet, `pg_dump` no deploy, um container de migração, um banco por worktree e um Testcontainers por suíte de
testes) sem que nada no uso precise dele.

A pesquisa em `docs/research/sqlite-aprendizados.md` leu três projetos que usam SQLite em produção (t3code,
hermes-agent e ai-memory) e inventariou o que a API usa do Postgres. Os três convergem: WAL, um escritor, leitores
somente leitura, `BEGIN IMMEDIATE` em toda escrita e SQL à mão, sem ORM. O migrador do Drizzle para SQLite pula
migration fora de ordem, não percebe banco de versão mais nova e roda `PRAGMA foreign_keys` dentro de uma transação,
onde ele não tem efeito.

## Decisão

1. **A API guarda tudo num arquivo SQLite** (`API_DATABASE_PATH`; em produção, `/data/api.sqlite` num volume do pod;
   localmente, `.data/api.sqlite` na raiz de cada worktree). O auth continua no Postgres por enquanto e migra depois,
   num PR próprio, porque concentra os riscos de segurança (locks de sessão, papéis do banco).
2. **Produção recomeça vazia.** Não há cópia dos dados do Postgres; o banco `braid` fica parado como arquivo histórico.
3. **Sem ORM, no desenho do t3code.** O driver é o `node:sqlite` do Node. As consultas são um template `sql\`...\`` que
   separa texto e parâmetros (`persistence/sqlite/sql.ts`), e cada linha lida passa por um codec que a valida e a
   converte para a forma do domínio (`persistence/sqlite/columns.ts`, `database/tables.ts`). O DDL mora só nas
   migrations.
4. **Um escritor e um leitor.** Uma conexão grava, com uma fila de uma vaga para que só uma transação esteja aberta
   nela; a leitura fora de transação vai por uma conexão aberta somente leitura. Toda transação abre com
   `BEGIN IMMEDIATE`. Isso substitui o `FOR UPDATE SKIP LOCKED` da fila, o `FOR SHARE` e os advisory locks por usuário.
5. **Tipos.** Data e hora em texto ISO-8601 UTC com milissegundos (a forma de `toISOString`, que compara como texto);
   dia e hora do dia em texto; JSON em texto com CHECK de `json_valid`/`json_type`; booleano 0/1.
6. **Migrations em SQL à mão** (`apps/api/migrations/NNNN_nome.sql`), aplicadas por um migrador próprio na subida da
   API, depois de uma cópia do arquivo: registro por nome e checksum, uma transação `BEGIN IMMEDIATE` por arquivo,
   chaves estrangeiras desligadas em volta do runner e conferidas antes de cada commit, recusa de banco migrado por um
   build mais novo e de migration editada.
7. **O SQL do agente roda isolado por construção.** Cada consulta copia só as linhas do usuário para um banco em
   memória descartável e roda o SQL do agente nele, com authorizer de leitura, modo defensivo e tempo limite. Sai o
   parser do Postgres (`libpg-query`).

## Consequências

- Some o Postgres da API: o deploy não roda mais um container de migração, o backup copia o arquivo com `VACUUM INTO`
  e confere com `integrity_check`, a worktree não cria mais a base `<slug>`, e os testes de integração da API abrem um
  arquivo temporário em vez de um container.
- A API não escala para mais de uma réplica: o deployment usa `strategy: Recreate` e um volume `ReadWriteOnce`. A
  promessa de que duas instâncias nunca pegam o mesmo job (`docs/runbook/ai-jobs.md`) passa a valer dentro do único
  processo.
- O que o Postgres conferia e o SQLite não confere fica no domínio: o intervalo de cada aviso em
  `notify_offsets_minutes` (um CHECK não aceita subconsulta) e a caixa de letras não ASCII em `lower()`.
- O `UNIQUE (task_id, position)` deixa de ser `DEFERRABLE`: as relações de uma tarefa são apagadas e regravadas
  juntas, sem deslocar posições no lugar.
- O volume do pod precisa ser disco local: SQLite em WAL não funciona sobre sistema de arquivos de rede.
