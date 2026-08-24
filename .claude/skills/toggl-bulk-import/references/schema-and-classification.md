# Schema do payload e regras de classificação

## Formato do PDF (relatório detalhado do Toggl Track)

O PDF tem páginas alternadas que juntas descrevem as mesmas linhas de evento — os
números da coluna `#` se correspondem 1:1 entre uma página e a seguinte:

- **Página ímpar** (`DESCRIPTION | DURATION | MEMBER`): nome do evento, duração
  (H:MM:SS) e quem executou.
- **Página par** (`PROJECT | TAGS | TIME | DATE`): projeto do Toggl, tags, e o
  intervalo de horário com a(s) data(s).

A coluna `PROJECT` é apenas o filtro usado para gerar o relatório no Toggl (neste
projeto, tudo é exportado sob o projeto "routine") — **não use `PROJECT` para
decidir o `type` do evento**. O sinal confiável é `TAGS` (e, na ausência de tag, a
própria descrição).

A coluna `TIME | DATE` já traz o horário de início e fim. Quando o evento cruza a
meia-noite, aparecem duas datas (`20:46 - 01:17` / `08/19/2026 - 08/20/2026`) — use a
primeira data para o horário de início e a segunda para o horário de fim. Isso evita
ter que calcular a duração manualmente; use a duração da página ímpar só como
desempate quando início e fim aparecerem no mesmo minuto (ex.: `05:57 - 05:57`).

## Classificação do tipo (routine | food | training | sleep)

Ordem de prioridade — pare no primeiro critério que bater:

1. **Tag contém "sono"** → `sleep`
2. **Tag contém "alimenta" ou "cafe"** (ex.: `alimentacao`, `cafe da manha`) → `food`
3. **Tag contém "academia", "treino" ou "musculacao"** → `training`
4. **Sem tag utilizável** → aplique o mesmo critério na *palavra inteira* da
   descrição (não substring): `dormir` → `sleep`; `café da manhã`/`almoço`/
   `jantar`/`janta`/`lanche` → `food`; descrição cujo assunto principal é
   `academia`/`musculação`/`esteira` → `training`.
5. **Caso contrário** → `routine` (tipo padrão/guarda-chuva).

Por que tag primeiro e substring nunca: a linha "arrumando para academia -
arrumando a cama - indo ao banheiro - ..." contém a palavra "academia" mas é uma
rotina de preparação, não o treino em si — no PDF ela não tem tag, enquanto a linha
"academia" (linha 24 do exemplo real) tem a tag `academia` mesmo. Um match por
substring classificaria errado; a tag resolve isso.

## Payload JSON esperado pelo script

```json
{
  "events": [
    {
      "name": "café da manhã",
      "type": "food",
      "startedAt": "2026-08-20T08:00",
      "finishedAt": "2026-08-20T08:09",
      "tags": []
    },
    {
      "name": "dormir",
      "type": "sleep",
      "startedAt": "2026-08-19T20:46",
      "finishedAt": "2026-08-20T01:17",
      "tags": []
    }
  ]
}
```

- `startedAt`/`finishedAt`: string local **sem fuso** (`YYYY-MM-DDTHH:mm`), horário de
  parede exatamente como aparece no relatório. O script interpreta esses valores no
  fuso `America/Sao_Paulo` (mesmo fuso que `src/lib/timeline/format-date.ts` usa para
  renderizar a timeline) e converte para o instante UTC correto — **não faça essa
  conversão você mesmo**, apenas copie o horário local do relatório.
- `tags`: as tags do Toggl da linha, em minúsculas (o script normaliza de qualquer
  forma). A tag usada para classificar o tipo também deve continuar na lista —
  ela é uma informação real do evento, não apenas um sinal de classificação.
- `name`: use a descrição da linha como está (a coluna `DESCRIPTION` da página
  ímpar).
- Não inclua `id`, `userId`, `data`, `description`, `createdAt`/`updatedAt` — o
  script preenche tudo isso.

## Payload de bulk no Firestore (o que o script grava)

Collection `events`, um documento por evento, no formato `EventDocument`
(`src/models/events/infra/persistence/repositories/mappers/event-document.mapper.ts`):

```ts
{
  id: string;            // hash determinístico de userId+type+startedAt+name
  type: "routine" | "food" | "training" | "sleep";
  userId: string;
  name: string;
  description: string;   // "" para importação em massa
  startedAt: string;      // ISO 8601 UTC
  finishedAt: string;     // ISO 8601 UTC
  tags: string[];
  interruptions: [];      // sempre vazio na importação
  data: Record<string, unknown>;  // ver defaults por tipo abaixo
  createdAt: string;      // momento da importação, não do evento
  updatedAt: string;
}
```

### Defaults de `data` por tipo (quando o PDF não traz o dado)

O objetivo é que qualquer tipo possa ser criado por esta skill mesmo sem os campos
ricos que o app normalmente calcula (ex.: nutrição de uma refeição vem de um parser
de LLM; aqui não temos isso). Os defaults abaixo replicam o que as próprias
entidades de domínio já fazem quando um campo opcional não é passado
(`src/models/events/domain/entities/*.ts`):

| type       | `data`                                                                 |
|------------|-------------------------------------------------------------------------|
| `routine`  | `{}`                                                                     |
| `sleep`    | `{ trackedSleepTime: <minutos entre startedAt e finishedAt>, score: 0 }` |
| `training` | `{ workouts: [], caloriesBurned: 0 }`                                    |
| `food`     | `{ inputText: name, items: [], totals: <tudo zerado>, modelProvider: "bulk-import", modelName: "toggl-report", parsedAt: <agora> }` |

Se um write for rejeitado por causa de um campo faltando em algum tipo, o conserto
correto é ajustar `buildDefaultData()` em `scripts/bulk-import-events.mjs` para
aquele tipo genericamente — não criar um caso especial só para o evento que falhou.
