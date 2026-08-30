# ADR-006 — PostgreSQL e Redis em containers no VPS

## Status

Aceita para o projeto pessoal e para o primeiro servidor de 4 GiB.

## Contexto

A API atual ainda usa Firestore, mas a persistência será migrada para PostgreSQL. Um
serviço futuro processará filas em Redis. A infraestrutura precisa estar pronta e ter
restore validado antes dessas migrações, sem transformar banco disponível em dependência
prematura da API.

## Decisão

- PostgreSQL 16 e Redis 7 rodam no mesmo VPS via Docker Compose.
- Ambos participam somente da rede `data`, marcada `internal: true`, sem `ports:`.
- PostgreSQL tem limite de 384 MiB; Redis, 192 MiB.
- O banco inicial chama-se `timeline` e possui roles distintas de administração,
  migrations e runtime.
- Redis usa AOF `everysec`, `maxmemory=128mb` e `noeviction`, porque filas não podem
  perder jobs por política de eviction.
- Backups incluem globals/roles, database e snapshot Redis, são copiados para destino
  externo e restaurados num ambiente descartável.
- No primeiro deploy, a API não recebe credenciais desses serviços.

## Por que subir antes de conectar

Separar instalação e migração permite validar volume, tuning, credenciais, backup,
restore e monitoramento sem risco sobre dados da aplicação. A futura migração do
Firestore terá plano próprio, incluindo schema, cópia, reconciliação e rollback.

## Alternativas

**PostgreSQL gerenciado.** Reduz trabalho operacional e melhora recuperação, mas aumenta
custo e remove parte do objetivo de aprendizado. Continua sendo a migração recomendada
se o projeto ganhar usuários pagantes ou exigir disponibilidade maior.

**Redis gerenciado.** Boa evolução para filas críticas. Não é necessário com baixo volume
e jobs ainda inexistentes.

**Instalação direta no host.** Economiza uma camada, mas cria dois modelos operacionais.
Containers mantêm limites, logs e atualização consistentes com o restante da stack.

**Fila no PostgreSQL.** `SKIP LOCKED`, pgmq ou graphile-worker poderiam eliminar Redis.
Redis foi mantido porque já faz parte do plano e será avaliado quando `jobs-api` existir.

**Segundo PostgreSQL.** Rejeitado. Serviços pequenos usam o mesmo processo com databases,
schemas e roles isoladas; outro container desperdiçaria RAM.

## Consequências

- O proprietário do projeto é responsável por tuning, atualização e recuperação.
- A perda total do VPS pode perder dados desde o último backup diário.
- Banco e app compartilham domínio de falha.
- Nenhum dado real entra antes do primeiro restore externo bem-sucedido.
- Tornar PostgreSQL/Redis dependências da API exige mudança explícita de readiness e
  entrega controlada de credenciais.

## Gatilhos de revisão

- usuários pagantes ou RPO menor que 24 horas;
- necessidade de PITR, réplica ou failover;
- filas com garantia operacional superior à oferecida por um único VPS;
- uso sustentado de RAM acima de 80%;
- pools próximos de `max_connections=30`.
