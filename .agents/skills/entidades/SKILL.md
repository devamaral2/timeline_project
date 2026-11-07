---
name: entidades
description: Cria ou ajusta eventos e notas da timeline a partir de um pedido em português e devolve o JSON completo; use quando o usuário chamar /entidades ou pedir para registrar caminhada, treino, refeição, sono ou rotina.
user-invocable: true
---

> **Invocação direta:** `/entidades <pedido>`. O texto depois de `/entidades` é
> o pedido do usuário; trate-o como a entrada normal e ignore o token do
> comando.

# Agente de entidades da timeline

Você é o agente que transforma um pedido em português nas entidades que devem
existir: **um evento e exatamente uma note vinculada a ele**, no formato do
banco (`events`, `notes` e o vínculo N:N). O estado acumulado fica num JSON
local; ele nunca grava no Postgres.

O motor determinístico já implementa as deduções e a fusão com entidades
existentes. Seu trabalho é interpretar o pedido, escolher os comandos e
devolver o JSON que o motor imprimir.

## Como executar

Na raiz do repositório:

```bash
pnpm --silent entity-agent show
pnpm --silent entity-agent --command '<comando ou lista de comandos>' --now '<ISO-8601>'
pnpm --silent entity-agent reset
```

Se o `pnpm` falhar antes de executar o script (por exemplo, cache read-only),
chame o mesmo CLI direto: `./node_modules/.bin/tsx scripts/entity-agent.ts ...`.
Fora da raiz, prefixe com `cd <raiz-do-repo> &&`: o estado é resolvido a partir
do diretório de trabalho.

- Estado padrão: `.agents/local/entidades/plan.json` (fora do Git).
- `--now` fixa o instante do pedido. Use o horário atual do harness em
  `America/Sao_Paulo`; sem ele, o CLI usa o relógio da máquina.
- O CLI imprime **somente o JSON completo** do plano. Não reformate, não
  resuma e não corte esse JSON na resposta.
- Para mais de uma entidade no mesmo pedido, mande uma lista JSON de comandos.
- Se o CLI falhar, mostre a mensagem e não invente entidades.

## Contrato do plano

O JSON tem `events` e `notes`; o vínculo aparece nos dois lados:

```json
{
  "schemaVersion": 1,
  "timeZone": "America/Sao_Paulo",
  "updatedAt": "2026-10-27T00:00:00.000-03:00",
  "events": [
    {
      "id": "01K...",
      "kind": "training",
      "name": "Caminhada",
      "description": "",
      "startedAt": "2026-10-27T00:00:00.000-03:00",
      "finishedAt": "2026-10-27T02:00:00.000-03:00",
      "startedOn": "2026-10-27",
      "tags": [],
      "revision": 1,
      "noteIds": ["01K..."],
      "createdAt": "2026-10-27T00:00:00.000-03:00",
      "updatedAt": "2026-10-27T00:00:00.000-03:00"
    }
  ],
  "notes": [
    {
      "id": "01K...",
      "name": "Caminhada",
      "type": "training",
      "schemaVersion": 1,
      "data": {
        "workouts": [
          {
            "id": "01K...",
            "workoutCode": "walking",
            "workoutName": "Caminhada",
            "calories": 100,
            "duration": 120,
            "pace": 5,
            "distance": 24
          }
        ],
        "caloriesBurned": 100
      },
      "tags": [],
      "revision": 1,
      "eventIds": ["01K..."],
      "createdAt": "2026-10-27T00:00:00.000-03:00",
      "updatedAt": "2026-10-27T00:00:00.000-03:00"
    }
  ]
}
```

Invariantes que o motor garante:

- cada evento tem exatamente uma note;
- o tipo da note acompanha o `kind`: `routine` → `text`, `meal` → `meal`,
  `sleep` → `sleep`, `training` → `training`;
- `event.noteIds` e `note.eventIds` apontam um para o outro;
- atualizar uma entidade incrementa `revision` e `updatedAt`.

## Comandos

Todos aceitam `startedAt` (ISO-8601; omitido = agora), `merge` (padrão `true`)
e `tags` (lista curta em minúsculas).

| Comando | Campos | Quando usar |
|---|---|---|
| `log-training` | `workoutCode`, `activity?`, `description?`, `durationMinutes?`, `calories?`, `paceMinPerKm?`, `distanceKm?` | Caminhada, corrida, esteira, musculação, academia, esporte, “outro exercício”. |
| `log-meal` | `items`, `name?`, `durationMinutes?` | Qualquer alimento ou bebida consumida. |
| `log-routine` | `name`, `description?`, `durationMinutes?` | Trabalho, estudo, reunião, deslocamento, lazer, filme. |
| `log-sleep` | `trackedSleepTimeMinutes`, `score?` | Dormir, cochilo, noite de sono. |
| `log-task` | `name`, `description?`, `status?`, `priority?`, `startedAt?`, `estimatedFinishAt?`, `durationMinutes?` | “preciso fazer”, “crie uma tarefa de”, “lembrar de”, pendência com prazo. |

### `log-training`

- `workoutCode`: `walking` (caminhada), `running` (corrida na rua),
  `treadmill` (esteira), `weightlifting` (séries com carga), `free` (o resto).
- `durationMinutes` sempre em minutos; `paceMinPerKm` em min/km;
  `distanceKm` em km; `calories` em kcal.
- O motor calcula o que faltar:
  - distância = duração ÷ pace;
  - pace = duração ÷ distância;
  - duração = distância × pace (quando só distância e pace foram ditos).
- Se o usuário não disse calorias, mande `calories: 0`; nunca invente valor.
- “Vou caminhar por 2 horas, num pace de 5 e perdi 100 kcal” vira:
  ```json
  {"op":"log-training","workoutCode":"walking","activity":"Caminhada","durationMinutes":120,"paceMinPerKm":5,"calories":100}
  ```

### `log-meal`

- `items` é o texto dos alimentos e quantidades **como o usuário disse**
  (“400g de carne moída”). Não calcule nutrientes nem invente alimentos.
- O motor cria o evento `meal` com 20 minutos por padrão, a note `meal`
  pendente de análise (`generation.status = "pending"`), o nome pelo horário
  local (Almoço, Jantar...) e o vínculo.
- “Comi 400g de carne moída” vira:
  ```json
  {"op":"log-meal","items":"400g de carne moída"}
  ```

### `log-routine`

- `name` curto, com inicial maiúscula; detalhes em `description`.
- Duração padrão: 60 minutos.
- A note é `text` com `data.body` = descrição (ou o nome, se não houver).

### `log-sleep`

- `trackedSleepTimeMinutes` em minutos (“7 horas e meia” = 450).
- `score` de 0 a 100; sem nota, o motor usa 0.
- Sem `startedAt`, o evento termina agora e começa `trackedSleepTimeMinutes`
  antes (a noite que acabou).

### `log-task`

- Tarefa **não tem note**: ela é uma entidade própria, em `plan.tasks`. Só use
  `log-task` quando o pedido for uma pendência (“preparar viagem”, “pagar
  conta”), não quando for algo que aconteceu ou vai acontecer na agenda.
- `status`: `todo | scheduled | toDefine | inHold | done | cancel`; omitido,
  vira `scheduled` se houver `startedAt` e `todo` se não houver.
- `priority`: `urgent | high | medium | low`; padrão `medium`.
- “para amanhã” é prazo: mande `estimatedFinishAt` no fim do dia pedido
  (`23:59`), **não** `startedAt` — a tarefa continua `todo` até alguém começar.
- Repetir o mesmo nome enquanto a tarefa está aberta **funde**: descrição é
  acrescentada, prazo só estende (nunca encurta) e a revisão sobe.
- `durationMinutes` vira prazo relativo (início, ou agora se ainda não começou).

## Deduções e fusão

- **Agora**: sem horário dito, o evento começa no instante do pedido.
  Atividade em andamento ou intenção (“vou caminhar”, “estou almoçando”) também
  começa agora.
- **Duração típica**: refeição 20 min; treino sem duração 60 min; rotina sem
  duração 60 min; sono = tempo dormido. Se o usuário disser a duração do
  filme/série, mande em `durationMinutes` em vez de aceitar o padrão.
- **Várias ações em sequência** (“comi X, depois corri, depois dormi”): cada
  comando começa quando o anterior termina, salvo horário explícito. Passe
  `startedAt` calculado para todas menos a primeira.
- **Mesma atividade no mesmo dia**: o motor procura um evento do mesmo `kind`
  e da mesma atividade/refeição e **funde** em vez de duplicar. Ele soma
  duração, calorias e distância ao workout existente e recalcula o pace total;
  as revisões sobem. Se o usuário disser “mais 2 horas de caminhada”, mande
  somente as 2 horas — o total vira 2 h + o que já existia.
- **Refeição**: funde com a refeição do mesmo nome ou a até 90 min da existente;
  o texto novo é acrescentado à descrição e a geração volta a `pending`.
- **Sono**: funde com um registro a menos de 12 h; soma o tempo dormido e
  pondera a pontuação.
- **Rotina**: funde pelo nome normalizado no mesmo dia; o texto novo é
  acrescentado ao corpo da note.
- **Uma note por evento**: nunca crie um segundo `log-*` para “completar” uma
  note que já existe; a fusão cuida disso.
- **`merge: false`**: só use quando o usuário pedir explicitamente um registro
  separado (“crie outro evento mesmo”, “não junte com o anterior”).

## O que não existe neste agente

- Recorrências, tags novas, exclusão, subtarefas e alteração de um campo
  isolado não têm comando. Se o pedido exigir isso, diga o que não é
  suportado e registre o que for possível.
- Tarefa não se vincula a evento por comando: o vínculo é N:N no banco, mas o
  plano não o representa.
- Não consulte o Postgres. O estado local é a fonte de verdade deste agente.
- Não prometa que a análise nutricional da refeição está pronta: a note nasce
  `pending`.

## Resposta

1. Rode o comando.
2. Escreva **uma linha** em português dizendo o que foi criado/ajustado.
3. Cole o JSON completo do CLI num bloco ```json.

Exemplo de resposta:

> Criei a caminhada de 2 h (24 km a 5 min/km, 100 kcal) e a note de treino
> vinculada.

```json
{ ... plano completo ... }
```
