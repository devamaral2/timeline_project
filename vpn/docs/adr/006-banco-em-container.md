# ADR-006 — Postgres e Redis em container no próprio VPS

**Status:** aceita, **com ressalva explícita** · **Data:** 2026-08-25

## Contexto

As aplicações precisam de banco relacional e de um armazenamento em memória para cache,
sessões e filas. As opções vão de serviços gerenciados na nuvem a instalação direta no
host.

Esta é a decisão de maior risco de toda a spec, e vale registrar isso de forma explícita.

## Decisão

**Postgres 16 e Redis 7 em containers no próprio VPS**, em rede `internal` sem acesso à
internet, com backup diário para bucket externo e restore testado.

⚠️ Esta decisão é **condicionada** ao backup testado. Sem ele, não é risco calculado — é
apenas risco.

## O risco, dito sem rodeios

Banco em container, num VPS único, significa:

- **Sem failover.** O servidor morre, o banco morre junto.
- **Sem recuperação a ponto no tempo** com a configuração padrão. A perda máxima é o
  tempo desde o último backup — até 24 horas.
- **Sem réplica.** Corrupção do volume é perda total.
- **O banco compete por recursos** com aplicação, proxy e observabilidade no mesmo
  servidor.

Para uma aplicação com clientes pagantes, isso não seria aceitável.

## Alternativas consideradas

**Postgres gerenciado (Neon, Supabase, Railway, RDS).** Backup automático, PITR,
réplicas, atualizações sem esforço, alta disponibilidade. **Para uma aplicação séria, esta
é a escolha responsável.** O free tier do Neon serve projetos pequenos; ele inclusive
suspende o banco quando ocioso, reduzindo custo a zero.

Descartado aqui por três motivos, nesta ordem de peso: (1) o aprendizado operacional é um
objetivo declarado — configurar, tunar e fazer backup de um Postgres ensina coisas que
usar um gerenciado não ensina; (2) latência — banco e aplicação na mesma máquina eliminam
o salto de rede; (3) independência e custo previsível.

**Redis gerenciado (Upstash).** Mesmo raciocínio. O free tier é generoso e o modelo de
cobrança por requisição é adequado a projeto pequeno.

**Instalação direta no host, sem container.** Menos camadas, desempenho marginalmente
melhor, e o dado não depende do ciclo de vida do container. O contra é a inconsistência
operacional: um serviço gerenciado por `systemd` e o resto por Docker significa dois
modelos de atualização e dois lugares para investigar. Com volumes nomeados, a diferença
de desempenho é pequena demais para decidir.

**SQLite.** Para muitas aplicações pequenas seria suficiente e eliminaria dois containers
(~576MB). Descartado porque não suporta bem escrita concorrente entre processos, e limita
o que você aprende. Vale lembrar que existe: para uma app de leitura predominante, seria a
escolha mais eficiente.

**Dispensar o Redis, usando só o Postgres.** Tecnicamente viável e economiza 192MB. Para
cache, `UNLOGGED TABLE` resolve; para fila, `SKIP LOCKED` e ferramentas como `pgmq` ou
`graphile-worker` são excelentes. **Menos peças é uma vantagem real.** Mantido porque foi
pedido explicitamente e porque é a ferramenta certa para sessões e rate limiting
distribuído — mas é a peça mais dispensável da stack.

## Consequências

**Positivas.** Latência de rede próxima de zero. Controle total de versão, extensões e
configuração. Custo zero além do VPS. Aprendizado operacional real: tuning, backup,
restauração, diagnóstico de consulta lenta.

**Negativas.** Você é o DBA. Backup, monitoramento, atualização e recuperação são sua
responsabilidade. Sem alta disponibilidade. Competição por recursos no mesmo servidor.

**Mitigações obrigatórias** (não opcionais):

1. Backup diário para bucket externo, com verificação de tamanho no script
2. **Restauração testada a partir do bucket antes de existir dado real**
3. Alerta de disco em 80%
4. `mem_limit` explícito para conter o consumo
5. Usuário de aplicação sem privilégios administrativos
6. Rede `internal`, sem porta publicada

## Quando revisitar

- **Assim que houver dado de terceiros** cuja perda cause dano real a alguém: migre para
  gerenciado. `pg_dump` + `pg_restore` torna a migração trivial.
- Se o banco passar a competir por recursos de forma perceptível
- Se você precisar de mais de 24h de garantia de recuperação: adote pgBackRest ou WAL-G
  para PITR, ou migre
- Se a operação do banco virar fardo em vez de aprendizado — o gerenciado existe para
  isso
