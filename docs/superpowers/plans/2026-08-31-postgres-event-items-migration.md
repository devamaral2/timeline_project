# Migração PostgreSQL e Event Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** substituir o Firestore por PostgreSQL e a hierarquia de eventos
por um único agregado Event com EventItem versionado, snapshots históricos,
catálogos Food/Meal híbridos e projeções de leitura eficientes.

**Architecture:** o domínio expõe Event.items como array ordenado; PostgreSQL
armazena cada item em event_items com um JSONB independente. Escritas do
agregado, tags e interrupções são atômicas. Timeline e overview diário usam
portas de projeção próprias e não hidratam agregados desnecessariamente.

**Tech Stack:** TypeScript 5.7, NestJS 11, PostgreSQL 17, Drizzle ORM e
drizzle-kit, node-postgres, Testcontainers, Vitest, Next.js 16 e Expo 57.

**Spec:** [2026-08-31-postgres-event-items-design.md](../specs/2026-08-31-postgres-event-items-design.md)

## Global Constraints

- Execute cada checkbox separadamente; pare ao primeiro resultado inesperado.
- Escreva o teste que falha antes do código de produção.
- Use sempre npm run --silent test:ai para testes normais do repositório.
- Use npm run --silent test:postgres para a suíte opt-in que sobe PostgreSQL real.
- Preserve os campos missed e priority e a semântica de fechamento atual.
- Não crie índice GIN genérico, tabela por tipo de item ou FK para IDs de
  proveniência guardados em JSONB.
- Não migre nem apague documentos existentes do Firestore. A remoção final é
  apenas do caminho de código, configuração e regras versionadas.
- Não implante commits intermediários das Tasks 8 a 12: projeções, API, web e
  mobile formam um único corte coordenado. Ao fim das Tasks 8 e 9, os testes
  focados devem passar, mas o aplicativo completo só volta a ser executável
  quando o provider Nest for ligado na Task 10.
- Não aceite leitura anônima como compatibilidade. Timeline, daily e tags
  passam a exigir Firebase Auth no corte.
- Todos os commits abaixo usam mensagens sugeridas; não inclua firebase-debug.log.

---

## Decisões de contrato fixadas para a execução

O contrato HTTP final será:

~~~ts
export type KnownEventItemType = "routine" | "meal" | "sleep" | "training";

export interface EventItemDtoOf<TType extends KnownEventItemType, TData> {
  id: string;
  position: number;
  type: TType;
  schemaVersion: number;
  isPrimary: boolean;
  data: TData;
}

export type EventItemDto =
  | EventItemDtoOf<"routine", RoutineData>
  | EventItemDtoOf<"meal", MealItem>
  | EventItemDtoOf<"sleep", SleepItem>
  | EventItemDtoOf<"training", TrainingData>;

export interface MealCreateInput {
  inputText: string;
}

export type CreateEventItemInput =
  | { type: "routine"; isPrimary?: boolean; data?: Record<string, never> }
  | { type: "meal"; isPrimary?: boolean; data: MealCreateInput }
  | { type: "sleep"; isPrimary?: boolean; data?: Partial<SleepItem> }
  | { type: "training"; isPrimary?: boolean; data?: TrainingInputData };

export type UpdateEventItemInput =
  | { id?: string; type: "routine"; schemaVersion: number; isPrimary: boolean; data: RoutineData }
  | { id?: string; type: "meal"; schemaVersion: number; isPrimary: boolean; data: MealItem }
  | { id?: string; type: "sleep"; schemaVersion: number; isPrimary: boolean; data: SleepItem }
  | { id?: string; type: "training"; schemaVersion: number; isPrimary: boolean; data: TrainingData };

export interface CreateEventInput {
  name?: string;
  description?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  items: CreateEventItemInput[];
}

export interface UpdateEventInput {
  eventId: string;
  expectedRevision: number;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  interruptions?: InterruptionPatchInput[];
  items?: UpdateEventItemInput[];
}

export interface TimelineEventPageDto {
  items: TimelineEventCardDto[];
  nextCursor?: string;
}

export interface TimelineEventCardDto {
  id: string;
  primaryItemId: string;
  primaryItemType: string;
  itemTypes: string[];
  missed: boolean;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  durationLabel: string;
  tags: string[];
  interruptions: Array<{
    name: string;
    description: string;
    durationLabel: string;
  }>;
}
~~~

Regras associadas:

- Create não aceita startedAt ou finishedAt; formulários usam o relógio do
  servidor e texto/voz continuam fornecendo uma agenda resolvida internamente.
- Um único item vira principal por padrão. Com dois ou mais, exatamente um
  precisa ter isPrimary true.
- Update substitui o array completo quando items está presente. A posição é o
  índice no array, IDs conhecidos são preservados, IDs ausentes são gerados e
  IDs de outro evento são recusados.
- Create e Update escolhem o principal somente por isPrimary; não existe um
  segundo primaryItemId de entrada que possa divergir dessas flags.
- MealCreateInput é transitório: inputText nunca é persistido como campo próprio;
  a normalização o transforma na description do MealItem.
- expectedRevision é obrigatório; ausência retorna 400 e divergência retorna
  409. A revisão incrementa exatamente uma vez por PATCH bem-sucedido.
- O endpoint GET /api/events devolve TimelineEventPageDto. nextCursor é
  base64url opaco, inclui startedAt e id, e só aparece quando há outra página.
- Legacy food vira item meal. Food continua sendo somente a entidade de
  catálogo e FoodItem continua sendo snapshot.
- TrainingData mantém os valores atuais dos formulários, mas cada workout
  passa a copiar workoutCode e workoutName do catálogo fixo.
- Timeline usa strings para tolerar metadata de um tipo novo e mostrar fallback.
  EventDetail continua discriminado pelos tipos registrados no release; JSONB
  de versão/tipo futuro desconhecido é erro de persistência, conforme a seção
  10 da especificação, até o contrato e o codec desse tipo serem implantados.

---

## Estratégia de migração e rollback

Esta é uma migração greenfield de persistência, sem importação de documentos.
O caminho seguro é expandir no branch, provar, cortar uma vez e só então
contrair:

1. adicionar domínio novo e infraestrutura PostgreSQL sem remover Firestore;
2. criar schema, migrations, repositórios e projeções PostgreSQL;
3. cortar contratos, API, web e mobile no mesmo branch;
4. rodar todas as provas com PostgreSQL real;
5. remover código Firestore e subclasses somente após não haver imports;
6. implantar migration antes do novo aplicativo.

Rollback operacional:

- Antes de aceitar escritas no novo release, basta redeployar o release
  anterior; o Firestore externo permanece intacto.
- Depois da primeira escrita PostgreSQL, não há rollback transparente para o
  release antigo porque não existe dual-write por decisão de escopo. Preserve o
  banco PostgreSQL e corrija/avance o release; não derrube tabelas e não volte o
  aplicativo a ler Firestore silenciosamente.
- As migrations são idempotentes via tabela de controle do Drizzle. Não inclua
  DROP TABLE automático. Qualquer contração destrutiva futura exige autorização
  separada e backup.
- Web e API devem ser publicados juntos. A versão mobile anterior receberá 401
  nas leituras antigas; planeje o corte apenas quando a versão nova puder ser
  exigida, porque reabrir leitura por userId seria restaurar o vazamento.

---

## Mapa de arquivos

### Criar

- packages/entities/src/events/items/event-item-definition.ts — contrato de
  codec, versão e incompatibilidades.
- packages/entities/src/events/items/event-item-registry.ts — registro e
  validação cruzada dos tipos.
- packages/entities/src/events/items/routine-data.ts — payload vazio.
- packages/entities/src/events/items/food-item.ts — snapshot alimentar.
- packages/entities/src/events/items/meal-item.ts — snapshot da refeição e
  cálculo de totais.
- packages/entities/src/events/items/sleep-item.ts — payload de sono.
- packages/entities/src/events/items/training-data.ts — snapshots de workout.
- packages/entities/src/events/entities/event-item.entity.ts — identidade,
  posição, versão e payload validado.
- packages/entities/src/events/errors/event.errors.ts — erros de validação,
  ownership, not found e revision conflict.
- packages/entities/src/catalog/types/catalog-scope.ts — escopo e ownership.
- packages/entities/src/catalog/entities/food.entity.ts — catálogo Food.
- packages/entities/src/catalog/entities/meal.entity.ts — receita Meal.
- packages/entities/src/catalog/entities/food.entity.test.ts
- packages/entities/src/catalog/entities/meal.entity.test.ts
- packages/entities/src/catalog/errors/catalog.errors.ts
- packages/entities/src/catalog/ports/food-repository.ts
- packages/entities/src/catalog/ports/meal-repository.ts
- packages/entities/src/events/contracts/event-item.dto.ts
- packages/entities/src/events/contracts/timeline-event-page.dto.ts
- packages/entities/src/events/ports/timeline-event-query.ts
- packages/entities/src/events/ports/daily-overview-query.ts
- packages/entities/src/events/ports/workout-catalog.ts
- packages/entities/src/events/ports/event-aggregate-repository.ts — porta nova
  usada durante a fase de expansão.
- packages/entities/src/events/ports/legacy-event-repository.ts — porta antiga
  isolada durante o corte e removida na contração.
- packages/entities/src/events/ports/legacy-tag-repository.ts — porta de tags
  Firestore mantida apenas durante o corte.
- packages/persistence/drizzle.config.ts
- packages/persistence/drizzle/0000_postgres_event_items.sql
- packages/persistence/drizzle/meta/_journal.json
- packages/persistence/drizzle/meta/0000_snapshot.json
- packages/persistence/src/database/postgres-database.ts
- packages/persistence/src/database/postgres-database.test.ts
- packages/persistence/src/database/schema/enums.ts
- packages/persistence/src/database/schema/events.ts
- packages/persistence/src/database/schema/catalog.ts
- packages/persistence/src/database/schema/index.ts
- packages/persistence/src/testing/postgres-test-context.ts
- packages/persistence/src/integration/postgres.integration.test.ts
- packages/persistence/src/benchmarks/timeline.benchmark.ts
- packages/persistence/src/benchmarks/benchmark-fixtures.ts
- packages/persistence/src/events/mappers/event-row.mapper.ts
- packages/persistence/src/events/mappers/event-row.mapper.test.ts
- packages/persistence/src/events/repositories/postgres-event.repository.ts
- packages/persistence/src/events/repositories/postgres-tag.repository.ts
- packages/persistence/src/events/queries/timeline-cursor.ts
- packages/persistence/src/events/queries/timeline-cursor.test.ts
- packages/persistence/src/events/queries/postgres-timeline-event.query.ts
- packages/persistence/src/events/queries/postgres-daily-overview.query.ts
- packages/persistence/src/catalog/postgres-workout.catalog.ts
- packages/persistence/src/catalog/catalog-access.ts
- packages/persistence/src/catalog/mappers/food-row.mapper.ts
- packages/persistence/src/catalog/mappers/meal-row.mapper.ts
- packages/persistence/src/catalog/repositories/postgres-food.repository.ts
- packages/persistence/src/catalog/repositories/postgres-meal.repository.ts
- apps/api/src/auth/firebase-admin-app.ts
- apps/api/src/events/gateways/meal-parsing.gateway.ts
- apps/api/src/events/gateways/openrouter-meal-parsing.gateway.ts
- apps/api/src/events/gateways/openrouter-meal-parsing.gateway.test.ts
- apps/api/src/events/services/meal-event-name.service.ts
- apps/api/src/events/services/meal-prompt-builder.service.ts
- apps/api/src/events/services/meal-prompt-builder.service.test.ts
- apps/api/src/events/services/meal-totals.service.ts
- apps/api/src/events/skills/create-meal-event.skill.ts
- apps/api/src/events/testing/in-memory-timeline-event.query.ts
- apps/api/src/events/testing/in-memory-daily-overview.query.ts
- apps/api/src/events/testing/in-memory-workout.catalog.ts
- apps/api/src/events/testing/in-memory-event-database.ts — estado compartilhado
  por eventos e sugestões de tags nos testes.
- apps/api/src/events/http/tags.controller.test.ts
- apps/api/src/common/domain-exception.filter.test.ts
- apps/web/src/lib/api/authed-fetch.ts
- apps/web/src/lib/api/authed-fetch.test.ts
- apps/web/src/lib/firebase/use-auth-state.ts
- apps/web/src/lib/firebase/use-auth-state.test.ts
- apps/web/src/components/events/new-event-forms/MealForm.tsx
- apps/web/src/components/events/new-event-forms/MealForm.test.tsx
- apps/web/src/components/events/new-event-forms/TagInput.test.tsx
- apps/web/src/components/events/edit-event-forms/MealEditForm.tsx
- apps/web/src/components/events/edit-event-forms/MealEditForm.test.tsx
- apps/web/src/components/events/EventDetailsModal.test.tsx
- apps/mobile/src/lib/events/timeline-page-cache.ts
- apps/mobile/src/lib/events/timeline-page-cache.test.ts
- apps/mobile/src/lib/api/client.test.ts

### Modificar

- package.json e pnpm-lock.yaml — scripts e dependências resolvidas.
- .env.example e infra/docker-compose.local.yml — conexão e serviço PostgreSQL.
- AGENTS.md — operação PostgreSQL e remoção das instruções Firestore.
- packages/entities/src/index.ts, contracts.ts e ports.ts — exports finais.
- packages/entities/src/events/entities/event.entity.ts e seu teste — agregado
  concreto.
- packages/entities/src/events/ports/event-repository.ts e tag-repository.ts —
  portas finais.
- todos os contratos em packages/entities/src/events/contracts — items,
  revision, primaryItemType, mealEvents e página.
- packages/persistence/package.json, index.ts e
  persistence.module.ts — Drizzle, pg, providers e shutdown.
- apps/api/src/config/env.ts e env.test.ts — DATABASE_URL.
- apps/api/src/auth/verify-firebase-token.ts — Firebase Admin local à API.
- apps/api/src/common/domain-exception.filter.ts — 400/403/404/409.
- apps/api/src/common/domain-exception.filter.test.ts — tradução isolada dos
  erros de domínio.
- apps/api/src/events/events.module.ts — tokens das três portas de leitura,
  repositório, tags e catálogo de workout.
- apps/api/src/events/http/events.controller.ts e todos os testes do controller
  — autenticação, página, items e ordem das rotas.
- apps/api/src/events/http/tags.controller.ts — autenticação e actor.
- todos os usecases, services, skills, gateways e testes em
  apps/api/src/events que hoje usam type, data, instanceof ou FoodEvent.
- apps/api/src/events/testing/in-memory-event.repository.ts e
  in-memory-tag.repository.ts.
- apps/api/src/operational/operational-contract.test.ts — readiness sem query.
- packages/timeline/src/date-window.ts, date-window.test.ts, event-metrics.test.ts,
  group-events-by-day.test.ts e index.ts — URL sem userId e fixtures do DTO final.
- packages/theme/src/tokens.ts, theme.test.ts e oklch.ts — renomear o token de
  tipo food para meal sem alterar os valores de cor.
- apps/web/src/styles/globals.css, theme-tokens.test.ts e
  apps/web/src/lib/tags/tag-color.ts — acompanhar o token meal.
- apps/web/src/app/[userId]/page.tsx e page.test.tsx — retirar leitura SSR
  anônima.
- TimelineList, EventCard, EventDetailsModal, EditEventModal, DayColumn,
  event-visuals, formulários e testes em apps/web/src/components/events.
- apps/web/src/components/events/new-event-forms/TagInput.tsx — token.
- apps/mobile/src/lib/api/client.ts — leitura autenticada.
- apps/mobile/src/lib/events/use-day-events.ts e testes de lógica — página e
  cursor.
- apps/mobile/src/components/DayTimeline.tsx, EventCard.tsx, event-visuals.ts e
  TagInput.tsx.
- apps/mobile/src/app/new-event.tsx e event/[eventId].tsx — items e revision.
- apps/mobile/src/app/[userId]/index.tsx — só monta a timeline após autenticação
  pronta e usa o uid autenticado para cache e chamadas.

### Excluir somente na contração final

- packages/entities/src/events/entities/food-event.entity.ts
- packages/entities/src/events/entities/routine-event.entity.ts
- packages/entities/src/events/entities/sleep-event.entity.ts
- packages/entities/src/events/entities/training-event.entity.ts
- packages/entities/src/events/types/event-type.ts
- packages/entities/src/events/ports/event-aggregate-repository.ts
- packages/entities/src/events/ports/legacy-event-repository.ts
- packages/entities/src/events/ports/legacy-tag-repository.ts
- todos os DAOs, repositories, mappers e testes Firestore sob
  packages/persistence/src/events.
- packages/persistence/src/firebase/admin-app.ts
- packages/persistence/src/firebase/admin-firestore.ts
- apps/api/src/events/gateways/food-parsing.gateway.ts
- apps/api/src/events/gateways/openrouter-food-parsing.gateway.ts e teste
- apps/api/src/events/services/food-event-name.service.ts e teste
- apps/api/src/events/services/food-prompt-builder.service.ts e teste
- apps/api/src/events/services/food-totals.service.ts
- apps/api/src/events/skills/create-food-event.skill.ts
- apps/web/src/components/events/new-event-forms/FoodForm.tsx
- apps/web/src/components/events/edit-event-forms/FoodEditForm.tsx
- firestore.rules, firestore.indexes.json e firebase.json
- .claude/skills/toggl-bulk-import/SKILL.md
- .claude/skills/toggl-bulk-import/references/schema-and-classification.md
- .claude/skills/toggl-bulk-import/scripts/bulk-import-events.mjs

---

## Task 1: preparar a infraestrutura PostgreSQL sem trocar providers

**Files:**

- Modify: package.json
- Modify: packages/persistence/package.json
- Modify: pnpm-lock.yaml
- Modify: .env.example
- Modify: infra/docker-compose.local.yml
- Modify: apps/api/src/config/env.ts
- Modify: apps/api/src/config/env.test.ts
- Create: packages/persistence/src/database/postgres-database.ts
- Create: packages/persistence/src/database/postgres-database.test.ts

**Interfaces:**

- Consumes: `.env`, `getServerEnv` e a configuração Compose atual.
- Produces: `getDatabaseEnv(): { DATABASE_URL: string }`,
  `PostgresDatabase.connect(connectionString)` com shutdown do pool e os scripts
  `db:generate`, `db:migrate` e `test:postgres`; nenhum provider ativo muda.

- [ ] **1.1 Escrever testes que exigem DATABASE_URL e fechamento do pool**

Em env.test.ts, adicione:

~~~ts
test("requires a PostgreSQL connection string", () => {
  expect(
    getDatabaseEnv({
      DATABASE_URL: "postgresql://timeline:timeline@127.0.0.1:5432/timeline",
    }).DATABASE_URL,
  ).toBe("postgresql://timeline:timeline@127.0.0.1:5432/timeline");
  expect(() => getDatabaseEnv({ DATABASE_URL: "" })).toThrow();
});
~~~

Em postgres-database.test.ts, injete um pool com end espiado e prove que
onApplicationShutdown chama end exatamente uma vez.

- [ ] **1.2 Rodar os testes e confirmar a falha por símbolos ausentes**

~~~powershell
npm run --silent test:ai apps/api/src/config/env.test.ts packages/persistence/src/database/postgres-database.test.ts
~~~

Esperado: falha porque DATABASE_URL e PostgresDatabase ainda não existem.

- [ ] **1.3 Instalar o toolchain**

~~~powershell
pnpm --filter @repo/persistence add drizzle-orm pg
pnpm --filter @repo/persistence add -D drizzle-kit @types/pg @testcontainers/postgresql
pnpm add -Dw tsx
~~~

Adicione ao package raiz:

~~~json
{
  "db:generate": "pnpm --filter @repo/persistence run db:generate",
  "db:migrate": "pnpm --filter @repo/persistence run db:migrate",
  "test:postgres": "cross-env RUN_POSTGRES_INTEGRATION=1 VITE_CJS_IGNORE_WARNING=true vitest run --config vitest.quiet.config.ts --project persistence packages/persistence/src/integration/postgres.integration.test.ts",
  "bench:postgres": "cross-env RUN_POSTGRES_INTEGRATION=1 tsx packages/persistence/src/benchmarks/timeline.benchmark.ts"
}
~~~

- [ ] **1.4 Implementar a conexão sem I/O no construtor**

postgres-database.ts deve expor:

~~~ts
export class PostgresDatabase implements OnApplicationShutdown {
  readonly db: NodePgDatabase;

  constructor(readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  static connect(connectionString: string): PostgresDatabase {
    return new PostgresDatabase(new Pool({ connectionString }));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
~~~

Na Task 5, especialize NodePgDatabase com o schema final. Não crie um schema
temporário.

- [ ] **1.5 Adicionar ambiente e Compose**

Crie getDatabaseEnv com um schema Zod separado e obrigatório; getServerEnv
continua independente para que testes de gateways não passem a exigir banco.
Ainda não chame getDatabaseEnv no bootstrap enquanto o provider ativo for
Firestore. Em .env.example use:

~~~dotenv
DATABASE_URL=postgresql://timeline:timeline@127.0.0.1:5432/timeline
~~~

Adicione postgres:17-alpine ao Compose, bind 127.0.0.1:5432, volume nomeado,
pg_isready, rede data e credenciais timeline/timeline. A API recebe internamente
postgresql://timeline:timeline@postgres:5432/timeline e depende do healthcheck.

- [ ] **1.6 Rodar testes, typecheck focado e validar o Compose**

~~~powershell
npm run --silent test:ai apps/api/src/config/env.test.ts packages/persistence/src/database/postgres-database.test.ts
pnpm turbo run typecheck --filter=@repo/persistence --filter=@repo/api
docker compose -f infra/docker-compose.local.yml config
~~~

Esperado: testes passam, tipos passam e Compose imprime uma configuração válida.

- [ ] **1.7 Commit**

~~~powershell
git add package.json packages/persistence/package.json pnpm-lock.yaml .env.example infra/docker-compose.local.yml apps/api/src/config/env.ts apps/api/src/config/env.test.ts packages/persistence/src/database
git commit -m "chore(db): add PostgreSQL toolchain"
~~~

---

## Task 2: criar payloads e codecs versionados de EventItem

**Files:**

- Create: packages/entities/src/events/items/event-item-definition.ts
- Create: packages/entities/src/events/items/event-item-registry.ts
- Create: packages/entities/src/events/items/event-item-registry.test.ts
- Create: packages/entities/src/events/items/routine-data.ts
- Create: packages/entities/src/events/items/food-item.ts
- Create: packages/entities/src/events/items/meal-item.ts
- Create: packages/entities/src/events/items/sleep-item.ts
- Create: packages/entities/src/events/items/training-data.ts
- Create: packages/entities/src/events/entities/event-item.entity.ts
- Create: packages/entities/src/events/entities/event-item.entity.test.ts
- Modify: packages/entities/src/index.ts
- Modify: packages/entities/src/contracts.ts

**Interfaces:**

- Consumes: ULID e os códigos aprovados `routine`, `meal`, `sleep` e `training`.
- Produces: payloads imutáveis, `EventItemDefinition<T>`,
  `EventItemRegistry.parse(type, data, schemaVersion)` e
  `EventItem.create(props, registry?)`; os símbolos públicos saem por
  `@repo/entities` e os tipos de contrato por `@repo/entities/contracts`.

- [ ] **2.1 Escrever os testes dos quatro payloads**

Cubra:

~~~ts
expect(parseRoutineData({}, 1)).toEqual({});
expect(() => parseRoutineData({ extra: true }, 1)).toThrow();
expect(parseMealItem(validMeal, 1).foodItems[0].micronutrients).toEqual({
  ironMilligrams: 2.1,
});
expect(() => parseMealItem({ ...validMeal, foodItems: "invalid" }, 1)).toThrow();
expect(() =>
  parseMealItem({ ...validMeal, totals: { ...validMeal.totals, totalCaloriesKcal: 1 } }, 1),
).toThrow("Meal totals do not match food items");
expect(parseSleepItem({ trackedSleepTime: 480, score: 83 }, 1)).toEqual({
  trackedSleepTime: 480,
  score: 83,
});
expect(parseTrainingData(validTraining, 1).workouts[0].workoutName).toBe(
  "Corrida",
);
expect(() => defaultEventItemRegistry.parse("meal", validMeal, 2)).toThrow(
  "Unsupported schema version",
);
const versionedTestRegistry = new EventItemRegistry([
  {
    type: "test-note",
    currentSchemaVersion: 2,
    incompatibleWith: [],
    parse(data, schemaVersion) {
      if (schemaVersion !== 1 && schemaVersion !== 2) {
        throw new EventValidationError("Unsupported schema version");
      }
      const source = data as { text: string; importance?: string };
      return {
        text: source.text,
        importance: source.importance ?? "normal",
      };
    },
  },
]);
const upgraded = versionedTestRegistry.parse("test-note", { text: "old" }, 1);
expect(upgraded).toEqual({
  schemaVersion: 2,
  data: { text: "old", importance: "normal" },
});
~~~

Use números finitos e não negativos para nutrição e treino. Não imponha faixa
ou unidade a trackedSleepTime e score. Compare totais de Meal em precisão de
duas casas decimais, igual às colunas numeric(10,2), e valide
TrainingData.caloriesBurned contra a soma dos workouts.

- [ ] **2.2 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai packages/entities/src/events/items/event-item-registry.test.ts packages/entities/src/events/entities/event-item.entity.test.ts
~~~

- [ ] **2.3 Implementar os formatos imutáveis**

FoodItem, MealTotals e MealItem devem ter exatamente os campos aprovados:

~~~ts
export interface FoodItem {
  id: string;
  sourceFoodId?: string;
  sourceFoodRevision?: number;
  name: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: {
    carbohydratesGrams: number;
    proteinsGrams: number;
    totalFatGrams: number;
    fiberGrams: number;
  };
  micronutrients: Record<string, number>;
}

export interface MealItem {
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
}
~~~

TrainingData usa snapshots discriminados por workoutCode:

~~~ts
export type WorkoutCode =
  | "treadmill"
  | "running"
  | "weightlifting"
  | "free";

export interface WorkoutSnapshotBase {
  id: string;
  workoutCode: WorkoutCode;
  workoutName: string;
  calories: number;
  duration: number;
}

export interface TrainingData {
  workouts: WorkoutSnapshot[];
  caloriesBurned: number;
}
~~~

Cardio acrescenta pace e distance; weightlifting acrescenta sets; free não
acrescenta campos. Sets preservam id, exercise, repetitions e weight.
TrainingInputData usa a mesma união por workoutCode, torna id opcional, não
aceita workoutName do cliente e não aceita caloriesBurned agregado; esses
valores são preenchidos/recalculados pela API a partir do catálogo e dos
workouts.

- [ ] **2.4 Implementar registro, versão e compatibilidade**

~~~ts
export interface EventItemDefinition<TData> {
  type: string;
  currentSchemaVersion: number;
  parse(data: unknown, schemaVersion: number): TData;
  incompatibleWith: readonly string[];
}
~~~

Registre routine, meal, sleep e training na versão 1. meal, sleep e training
incluem a si mesmos e os outros dois em incompatibleWith; routine não tem
incompatibilidades. EventItemRegistry.parse devolve data e a versão corrente;
uma definição de teste com currentSchemaVersion 2 converte explicitamente a
versão 1 sem escrever no banco. Tipo ou versão futura desconhecidos geram
EventValidationError.

- [ ] **2.5 Implementar EventItem**

EventItem.create gera ULID apenas quando id não veio, valida position inteiro
entre 0 e 32767, schemaVersion e payload pelo registro. Copie profundamente e
congele o payload para impedir que o chamador altere o snapshot por referência.
Após upgrade conhecido, a instância usa currentSchemaVersion; a leitura por si
só não persiste essa conversão, mas um PATCH explícito pode gravar a versão
corrente.

- [ ] **2.6 Rodar a prova e a suíte de domínio**

~~~powershell
npm run --silent test:ai packages/entities/src/events
pnpm turbo run typecheck --filter=@repo/entities
~~~

- [ ] **2.7 Commit**

~~~powershell
git add packages/entities
git commit -m "feat(domain): add versioned event items"
~~~

---

## Task 3: substituir a raiz abstrata por um agregado Event concreto

**Files:**

- Modify: packages/entities/src/events/entities/event.entity.ts
- Modify: packages/entities/src/events/entities/event.entity.test.ts
- Create: packages/entities/src/events/entities/legacy-event.entity.ts
- Modify: food-event.entity.ts, routine-event.entity.ts, sleep-event.entity.ts,
  training-event.entity.ts somente para apontarem ao LegacyEvent temporário
- Create: packages/entities/src/events/errors/event.errors.ts
- Create: packages/entities/src/events/ports/event-aggregate-repository.ts
- Modify: packages/entities/src/index.ts
- Modify: packages/entities/src/ports.ts

**Interfaces:**

- Consumes: `EventItem`, registry, interrupções, tags, prioridade e relógio já
  usados no domínio.
- Produces: `Event` concreto, `Event.create`, `Event.rehydrate`,
  `event.revise(changes)`, erros tipados e `EventAggregateRepository` temporário.

- [ ] **3.1 Preservar temporariamente a base legada**

Copie a classe abstrata atual para legacy-event.entity.ts, renomeie-a para
LegacyEvent e faça as quatro subclasses estenderem essa classe. Não a exporte
como Event. Isso mantém o caminho Firestore compilável enquanto event.entity.ts
recebe o agregado final.

- [ ] **3.2 Escrever testes de invariantes do agregado**

~~~ts
const routine = EventItem.create({
  position: 0,
  type: "routine",
  schemaVersion: 1,
  isPrimary: true,
  data: {},
});

const event = Event.create({
  userId: "user-1",
  name: "Planejamento",
  description: "",
  startedAt: new Date("2026-08-31T12:00:00.000Z"),
  tags: [" Trabalho ", "trabalho"],
  interruptions: [],
  items: [routine],
});

expect(event.revision).toBe(1);
expect(event.primaryItemId).toBe(routine.id);
expect(event.tags).toEqual(["trabalho"]);
expect(() => Event.create(propsWithMealAndSleep)).toThrow(
  "Incompatible event items",
);
expect(() => Event.create(propsWithoutPrimary)).toThrow(
  "Event requires exactly one primary item",
);
~~~

Também teste item ID duplicado, position duplicada, principal removido sem
substituto, finishedAt anterior e revisão menor que 1. Registre no teste um tipo
note sem incompatibilidades e prove que ele pode coexistir com routine; isso
trava a extensibilidade sem migration.

- [ ] **3.3 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai packages/entities/src/events/entities/event.entity.test.ts
~~~

- [ ] **3.4 Implementar Event e erros tipados**

Event.create normaliza tags, copia arrays, valida o conjunto inteiro e deriva
primaryItemId do único item principal. Exponha revise para reconstruir o
agregado com campos comuns/itens novos sem mutar a instância e com
revision = revision + 1. Reidratação usa create com a revisão persistida e não
incrementa.

Crie:

~~~ts
export class EventValidationError extends Error {}
export class EventNotFoundError extends Error {}
export class EventOwnershipError extends Error {
  constructor() {
    super("Only the event owner can modify it");
  }
}
export class EventRevisionConflictError extends Error {}
~~~

O repositório novo recebe Event e expectedRevision:

~~~ts
export interface EventAggregateRepository {
  save(event: Event): Promise<void>;
  saveClosingLatestOpen(event: Event, finishedAt: Date): Promise<void>;
  update(
    event: Event,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
  findLatestOpenByUserId(userId: string): Promise<Event | null>;
}
~~~

Mantenha event-repository.ts legado sem alterações neste task. A porta nova
permite que Firestore e API atuais continuem compilando durante a expansão.

- [ ] **3.5 Rodar testes novos e legados**

~~~powershell
npm run --silent test:ai packages/entities/src/events
pnpm turbo run typecheck --filter=@repo/entities
~~~

- [ ] **3.6 Commit**

~~~powershell
git add packages/entities/src
git commit -m "refactor(domain): make Event a single aggregate"
~~~

---

## Task 4: implementar Food e Meal como catálogos híbridos

**Files:**

- Create: packages/entities/src/catalog/types/catalog-scope.ts
- Create: packages/entities/src/catalog/entities/food.entity.ts
- Create: packages/entities/src/catalog/entities/food.entity.test.ts
- Create: packages/entities/src/catalog/entities/meal.entity.ts
- Create: packages/entities/src/catalog/entities/meal.entity.test.ts
- Create: packages/entities/src/catalog/errors/catalog.errors.ts
- Create: packages/entities/src/catalog/ports/food-repository.ts
- Create: packages/entities/src/catalog/ports/meal-repository.ts
- Modify: packages/entities/src/index.ts
- Modify: packages/entities/src/ports.ts

**Interfaces:**

- Consumes: `FoodItem`, `MealItem`, `MealTotals` e `CatalogScope`.
- Produces: entidades `Food`/`Meal`, snapshots autocontidos e portas mínimas com
  `save`, `update` e `findVisibleById`; não produz controller de catálogo.

- [ ] **4.1 Escrever testes de ownership, revisão e snapshots**

~~~ts
expect(() =>
  Food.create({ ...foodProps, scope: "global", ownerUserId: "user-1" }),
).toThrow("Global catalog entries cannot have an owner");

expect(() =>
  Food.create({ ...foodProps, scope: "user", ownerUserId: undefined }),
).toThrow("Private catalog entries require an owner");

const snapshot = food.toFoodItem({
  portion: "200 g",
  approximateWeightGrams: 200,
});
const changedFood = food.revise({ caloriesKcal: 150 });
expect(changedFood.revision).toBe(food.revision + 1);
expect(snapshot.caloriesKcal).toBe(200);

const meal = Meal.create({ ...mealProps, foodItems: [snapshot] });
expect(meal.totals).toEqual(calculateMealTotals([snapshot]));
const eventSnapshot = meal.toMealItem();
const changedMeal = meal.revise({ name: "Nova receita" });
expect(eventSnapshot.name).toBe(meal.name);
expect(changedMeal.revision).toBe(meal.revision + 1);
expect(eventSnapshot.foodItems[0]).not.toBe(snapshot);
~~~

- [ ] **4.2 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai packages/entities/src/catalog
~~~

- [ ] **4.3 Implementar CatalogScope e Food**

Food guarda colunas escalares, micronutrients, scope, ownerUserId, revision e
timestamps. revise devolve nova entidade e incrementa uma vez. toFoodItem
escala todos os nutrientes pela razão peso solicitado/peso de referência,
copia sourceFoodId/sourceFoodRevision e nunca mantém referência mutável.

- [ ] **4.4 Implementar Meal**

Meal guarda FoodItem[], calcula os cinco totais escalares na criação e em
revise, incrementa revision e produz MealItem com sourceMealId e
sourceMealRevision. Não agregue micronutrientes em Meal.

- [ ] **4.5 Definir as portas mínimas de catálogo**

~~~ts
export interface FoodRepository {
  save(food: Food, actorUserId: string): Promise<void>;
  update(
    food: Food,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<void>;
  findVisibleById(id: string, actorUserId: string): Promise<Food | null>;
}

export interface MealRepository {
  save(meal: Meal, actorUserId: string): Promise<void>;
  update(
    meal: Meal,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<void>;
  findVisibleById(id: string, actorUserId: string): Promise<Meal | null>;
}
~~~

Exporte CatalogNotFoundError, CatalogReadOnlyError e
CatalogRevisionConflictError. Essas portas não ganham controller nesta entrega;
existem para cumprir criação privada, leitura global/privada e concorrência da
camada de persistência.

- [ ] **4.6 Rodar testes e typecheck**

~~~powershell
npm run --silent test:ai packages/entities/src/catalog
pnpm turbo run typecheck --filter=@repo/entities
~~~

- [ ] **4.7 Commit**

~~~powershell
git add packages/entities/src/catalog packages/entities/src/index.ts packages/entities/src/ports.ts
git commit -m "feat(domain): add Food and Meal catalogs"
~~~

---

## Task 5: criar schema Drizzle, migration e seed

**Files:**

- Create: packages/persistence/drizzle.config.ts
- Create: packages/persistence/drizzle/0000_postgres_event_items.sql
- Create: packages/persistence/drizzle/meta/_journal.json
- Create: packages/persistence/drizzle/meta/0000_snapshot.json
- Create: packages/persistence/src/database/schema/enums.ts
- Create: packages/persistence/src/database/schema/events.ts
- Create: packages/persistence/src/database/schema/catalog.ts
- Create: packages/persistence/src/database/schema/index.ts
- Create: packages/persistence/src/testing/postgres-test-context.ts
- Create: packages/persistence/src/integration/postgres.integration.test.ts
- Modify: packages/persistence/src/database/postgres-database.ts
- Modify: packages/persistence/package.json
- Modify: package.json

**Interfaces:**

- Consumes: contratos do domínio, `PostgresDatabase` e a especificação das
  tabelas.
- Produces: `schema` Drizzle tipado, migration SQL, seed idempotente de workout
  e `createPostgresTestContext()` com reset/stop.

- [ ] **5.1 Criar o harness opt-in com PostgreSQL real**

postgres-test-context.ts deve:

~~~ts
const container = await new PostgreSqlContainer("postgres:17-alpine").start();
const pool = new Pool({ connectionString: container.getConnectionUri() });
const db = drizzle(pool, { schema });
await migrate(db, {
  migrationsFolder: resolve(__dirname, "../../drizzle"),
});
~~~

Retorne db, pool, reset e stop. reset usa TRUNCATE das tabelas mutáveis com
RESTART IDENTITY CASCADE e não remove workout, que é seed fixa. stop encerra
pool antes do container. O describe de integração só roda quando
RUN_POSTGRES_INTEGRATION=1.

- [ ] **5.2 Escrever primeiro os testes de schema**

Cubra no arquivo único de integração:

- migration aplicada duas vezes sem duplicar;
- seed workout com treadmill, running, weightlifting e free;
- CHECK de finished_at;
- JSONB de item precisa ser objeto;
- position não negativa e única por evento;
- no máximo um principal por evento;
- ownership válido em food e meal;
- micronutrients objeto e food_items array;
- nutrição não negativa;
- sourceFoodId/sourceMealId dentro de JSONB não criam FK e sobrevivem à remoção
  da linha de catálogo de origem;
- ausência de qualquer índice GIN em event_items.data.

- [ ] **5.3 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:postgres
~~~

Esperado: falha porque schema e migration ainda não existem. Se Docker não
estiver disponível, pare aqui e restaure o daemon; não marque o teste como
passado.

- [ ] **5.4 Implementar o schema Drizzle**

Modele exatamente as tabelas e índices das seções 5.1 a 5.4 da especificação:

- events;
- event_items;
- event_interruptions;
- tags;
- event_tags;
- food;
- meal;
- workout.

Use numeric com mode number para impedir strings no domínio. started_on é
generated e usa America/Sao_Paulo. event_items.type é text. IDs são char(26).

- [ ] **5.5 Gerar e revisar a migration**

Adicione ao package persistence:

~~~json
{
  "db:generate": "drizzle-kit generate --config drizzle.config.ts",
  "db:migrate": "drizzle-kit migrate --config drizzle.config.ts"
}
~~~

drizzle.config.ts carrega, em ordem, .env.local e .env da raiz com
process.loadEnvFile sem sobrescrever variáveis já definidas, exige DATABASE_URL,
aponta schema para src/database/schema/index.ts e out para drizzle.

~~~powershell
pnpm --filter @repo/persistence run db:generate -- --name postgres_event_items
~~~

Como não existe migration anterior, confirme que o gerador criou
0000_postgres_event_items.sql e metadados com o mesmo tag. Não renomeie somente
o SQL, pois isso separaria o arquivo do journal. Revise manualmente:

~~~sql
CREATE UNIQUE INDEX event_items_one_primary_idx
  ON event_items (event_id)
  WHERE is_primary;

CREATE INDEX event_items_type_event_idx
  ON event_items (type, event_id);

INSERT INTO workout (code, name, category)
VALUES
  ('treadmill', 'Esteira', 'cardio'),
  ('running', 'Corrida', 'cardio'),
  ('weightlifting', 'Musculação', 'strength'),
  ('free', 'Livre', 'free')
ON CONFLICT (code) DO NOTHING;
~~~

Confirme também generated column, checks JSONB, checks de ownership, checks
nutricionais, text_pattern_ops das tags e todos os ON DELETE CASCADE.

- [ ] **5.6 Rodar integração, testes normais e typecheck**

~~~powershell
npm run --silent test:postgres
npm run --silent test:ai packages/persistence/src/database
pnpm turbo run typecheck --filter=@repo/persistence
~~~

- [ ] **5.7 Commit**

~~~powershell
git add packages/persistence package.json pnpm-lock.yaml
git commit -m "feat(db): add PostgreSQL event schema"
~~~

---

## Task 6: persistir o agregado em uma transação

**Files:**

- Create: packages/persistence/src/events/mappers/event-row.mapper.ts
- Create: packages/persistence/src/events/mappers/event-row.mapper.test.ts
- Create: packages/persistence/src/events/repositories/postgres-event.repository.ts
- Modify: packages/persistence/src/integration/postgres.integration.test.ts
- Modify: packages/entities/src/events/ports/event-aggregate-repository.ts
- Modify: packages/entities/src/ports.ts

**Interfaces:**

- Consumes: schema Drizzle e `EventAggregateRepository`.
- Produces: `PostgresEventRepository` com save/find/update/delete, tags e
  interrupções na mesma transação, advisory lock e classificação 404/403/409.

- [ ] **6.1 Escrever testes do mapper**

Prove que:

- numeric chega ao domínio como number;
- event_items são ordenados por position;
- IDs de EventItem e Interruption permanecem estáveis;
- payload passa pelo codec da sua schemaVersion;
- item inválido no banco falha com contexto de eventId e itemId.

- [ ] **6.2 Escrever testes transacionais de integração**

Adicione casos:

~~~ts
await repository.save(event);
expect(await repository.findById(event.id)).toEqual(event);

await expect(
  repository.update(changed, "user-1", event.revision + 1),
).rejects.toBeInstanceOf(EventRevisionConflictError);

await expect(
  repository.update(changed, "user-2", event.revision),
).rejects.toBeInstanceOf(EventOwnershipError);
~~~

Inclua rollback provocando colisão global de EventItem.id: salve um primeiro
evento e tente salvar um segundo com o mesmo itemId; o pai do segundo é inserido
antes da PK do filho falhar e deve desaparecer no rollback. Cubra também delete
cascade, revisão incrementada uma vez e substituição completa de itens
preservando IDs. Grave a mesma tag duas vezes e prove que não duplica e que
created_at permanece o original; grave o mesmo nome para dois usuários e prove
que coexistem.

- [ ] **6.3 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai packages/persistence/src/events/mappers/event-row.mapper.test.ts
npm run --silent test:postgres
~~~

- [ ] **6.4 Implementar save, find, update e delete**

PostgresEventRepository implementa EventAggregateRepository durante a fase de
expansão; o alias final EventRepository só é adotado no corte da Task 9.

Uma única função privada grava filhos dentro da transação. Ela:

1. insere events;
2. insere event_items em ordem;
3. insere event_interruptions em ordem;
4. faz upsert de tags normalizadas por user_id;
5. insere event_tags.

save, saveClosingLatestOpen e update chamam essa mesma rotina dentro da própria
transação; nenhum deles delega tags a TagRepository ou confirma o pai antes do
upsert/link das tags.

Update usa:

~~~sql
UPDATE events
SET name = $1,
    description = $2,
    started_at = $3,
    finished_at = $4,
    missed = $5,
    priority = $6,
    revision = $7,
    updated_at = now()
WHERE id = $8
  AND user_id = $9
  AND revision = $10
RETURNING revision;
~~~

nextRevision precisa ser expectedRevision + 1 e igual a event.revision. Zero
linhas é classificado com SELECT user_id, revision FROM events WHERE id = $id:

- sem linha: EventNotFoundError;
- owner diferente: EventOwnershipError, sem retornar dados ou revisão;
- mesmo owner e revisão diferente: EventRevisionConflictError;
- mesmo owner e mesma revisão após zero linhas por corrida: revision conflict.

Nenhum filho é alterado fora da transação.

- [ ] **6.5 Implementar fechamento serializado**

Dentro da mesma transação:

~~~sql
SELECT pg_advisory_xact_lock(hashtext($1));

SELECT id, started_at, finished_at
FROM events
WHERE user_id = $1
ORDER BY started_at DESC, id DESC
LIMIT 1;
~~~

Só feche o registro retornado quando está aberto e finishedAt não é anterior a
started_at. Grave revision = revision + 1 e updated_at = finishedAt. Depois
insira o novo agregado. Isso faz um PATCH aberto com revisão anterior conflitar
depois do fechamento automático.

- [ ] **6.6 Adicionar provas de concorrência e ordem**

Use duas chamadas concorrentes no mesmo usuário e instante para provar que
ambos os novos eventos são persistidos, o evento anterior é fechado uma única
vez e somente um dos dois novos fica aberto. Adicione um evento fora de ordem
para provar closesInThePast e um evento antigo aberto atrás de um recente
fechado para provar que findLatestOpenByUserId retorna null.

- [ ] **6.7 Rodar as provas**

~~~powershell
npm run --silent test:postgres
npm run --silent test:ai packages/persistence/src/events/mappers/event-row.mapper.test.ts
pnpm turbo run typecheck --filter=@repo/persistence
~~~

- [ ] **6.8 Commit**

~~~powershell
git add packages/entities/src/events/ports packages/entities/src/ports.ts packages/persistence/src/events packages/persistence/src/integration
git commit -m "feat(db): persist Event aggregates atomically"
~~~

---

## Task 7: persistir catálogos com isolamento e revisão

**Files:**

- Create: packages/persistence/src/catalog/catalog-access.ts
- Create: packages/persistence/src/catalog/mappers/food-row.mapper.ts
- Create: packages/persistence/src/catalog/mappers/meal-row.mapper.ts
- Create: packages/persistence/src/catalog/repositories/postgres-food.repository.ts
- Create: packages/persistence/src/catalog/repositories/postgres-meal.repository.ts
- Modify: packages/persistence/src/integration/postgres.integration.test.ts
- Modify: packages/persistence/src/index.ts

**Interfaces:**

- Consumes: FoodRepository, MealRepository, Food, Meal e os erros definidos na
  Task 4; tabelas food e meal da Task 5.
- Produces: PostgresFoodRepository e PostgresMealRepository, sem providers Nest
  ou endpoints nesta entrega.

- [ ] **7.1 Escrever o teste de visibilidade**

Insira uma Food global pela fixture administrativa do teste e uma Food user pelo
repository. Prove:

~~~ts
expect(await foods.findVisibleById(globalFood.id, "user-a")).not.toBeNull();
expect(await foods.findVisibleById(globalFood.id, "user-b")).not.toBeNull();
expect(await foods.findVisibleById(privateFood.id, "user-a")).not.toBeNull();
expect(await foods.findVisibleById(privateFood.id, "user-b")).toBeNull();
~~~

Repita a matriz para Meal.

- [ ] **7.2 Rodar integração e confirmar a falha**

~~~powershell
npm run --silent test:postgres
~~~

Esperado: falha porque os repositories de catálogo ainda não existem.

- [ ] **7.3 Implementar mappers de Food e Meal**

Os mappers convertem numeric para number, copiam os mapas/arrays JSONB e
reidratam scope, ownerUserId, revision e timestamps. Meal sempre passa
food_items pelo parser de FoodItem e valida os totais persistidos.

- [ ] **7.4 Implementar leitura visível**

Use o mesmo predicado nos dois repositories:

~~~sql
WHERE id = $id
  AND (scope = 'global' OR owner_user_id = $actorUserId)
~~~

Registro privado alheio retorna null, não 403.

- [ ] **7.5 Implementar save privado**

save aceita somente scope user e ownerUserId igual ao actor. Tentar gravar
scope global por essa porta gera CatalogReadOnlyError; owner divergente gera
CatalogNotFoundError sem revelar outro usuário.

- [ ] **7.6 Implementar update otimista**

~~~sql
UPDATE food
SET name = $name,
    reference_portion = $referencePortion,
    reference_weight_grams = $referenceWeightGrams,
    calories_kcal = $caloriesKcal,
    carbohydrates_grams = $carbohydratesGrams,
    proteins_grams = $proteinsGrams,
    total_fat_grams = $totalFatGrams,
    fiber_grams = $fiberGrams,
    micronutrients = $micronutrients,
    revision = $nextRevision,
    updated_at = now()
WHERE id = $id
  AND scope = 'user'
  AND owner_user_id = $actorUserId
  AND revision = $expectedRevision;
~~~

Meal usa a mesma guarda e troca food_items e os cinco totais na mesma
instrução. Zero linhas é classificado assim: global visível gera read-only,
privado alheio/inexistente gera not found, privado próprio com revisão diferente
gera revision conflict.

- [ ] **7.7 Provar isolamento de snapshots**

No teste real:

1. salve Food privada;
2. derive e salve Meal com FoodItem;
3. derive e salve Event com MealItem;
4. atualize Food e prove Meal inalterada;
5. atualize Meal e prove Event inalterado.

Também prove um update concorrente bem-sucedido e outro
CatalogRevisionConflictError.

- [ ] **7.8 Rodar integração e typecheck**

~~~powershell
npm run --silent test:postgres
pnpm turbo run typecheck --filter=@repo/entities --filter=@repo/persistence
~~~

- [ ] **7.9 Commit**

~~~powershell
git add packages/persistence/src/catalog packages/persistence/src/integration packages/persistence/src/index.ts
git commit -m "feat(db): persist private Food and Meal catalogs"
~~~

---

## Task 8: implementar projeções, cursor, tags e catálogo workout

**Files:**

- Create: packages/entities/src/events/ports/timeline-event-query.ts
- Create: packages/entities/src/events/ports/daily-overview-query.ts
- Create: packages/entities/src/events/ports/workout-catalog.ts
- Create: packages/entities/src/events/ports/legacy-tag-repository.ts
- Create: packages/entities/src/events/contracts/timeline-event-page.dto.ts
- Modify: packages/entities/src/events/contracts/timeline-event-card.dto.ts
- Modify: packages/entities/src/events/contracts/daily-overview.dto.ts
- Create: packages/persistence/src/events/queries/timeline-cursor.ts
- Create: packages/persistence/src/events/queries/timeline-cursor.test.ts
- Create: packages/persistence/src/events/queries/postgres-timeline-event.query.ts
- Create: packages/persistence/src/events/queries/postgres-daily-overview.query.ts
- Create: packages/persistence/src/events/repositories/postgres-tag.repository.ts
- Create: packages/persistence/src/catalog/postgres-workout.catalog.ts
- Modify: packages/entities/src/events/ports/tag-repository.ts
- Modify: packages/persistence/src/events/repositories/firestore-tag.repository.ts
- Modify: packages/entities/src/ports.ts
- Modify: packages/persistence/src/integration/postgres.integration.test.ts

**Interfaces:**

- Consumes: schema das Tasks 5–7 e DTOs de projeção.
- Produces: `TimelineEventQuery.list(params, actorUserId)`,
  `DailyOverviewQuery.get(date, actorUserId)`, cursor opaco, tag repository e
  `WorkoutCatalog.findByCode`; timeline não hidrata `Event` nem seleciona JSONB.

- [ ] **8.1 Escrever testes do cursor opaco**

~~~ts
const encoded = encodeTimelineCursor({
  startedAt: new Date("2026-08-31T12:00:00.000Z"),
  id: "01K4A000000000000000000000",
});
expect(decodeTimelineCursor(encoded)).toEqual({
  startedAt: new Date("2026-08-31T12:00:00.000Z"),
  id: "01K4A000000000000000000000",
});
expect(() => decodeTimelineCursor("not-a-cursor")).toThrow(
  "Invalid timeline cursor",
);
~~~

- [ ] **8.2 Escrever testes de timeline no PostgreSQL**

Cubra:

- começa dentro da janela: entra;
- começa antes e termina dentro: entra;
- aberto antes da janela: não entra;
- termina antes: não entra;
- limites from-only e to-only;
- ordenação descendente por started_at e id;
- duas páginas sem repetição ou buraco;
- filtro encontra item secundário;
- principal, primaryItemId e itemTypes corretos na ordem de position;
- filtro e isolamento de tags por usuário;
- tags e interrupções ordenadas;
- DTO não contém data de event_items.

- [ ] **8.3 Escrever testes do overview**

Com dois usuários no mesmo dia, prove que apenas o actor entra. Inclua:

- MealItem com totais e dois mapas de micronutrientes;
- SleepItem;
- TrainingData;
- evento que atravessa o início do dia;
- evento aberto tratado como ponto;
- mealEvents em vez de foodEvents.

- [ ] **8.4 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai packages/persistence/src/events/queries/timeline-cursor.test.ts
npm run --silent test:postgres
~~~

- [ ] **8.5 Implementar TimelineEventQuery**

Primeiro fixe TimelineEventCardDto final, TimelineEventPageDto e
DailyOverviewDto nos contracts. Remova também accentColor e iconName do DTO;
essas escolhas pertencem aos event-visuals de cada cliente. DailyOverviewDto
usa mealEvents e expõe workoutCode/workoutName nos treinos. A porta retorna o
envelope final e recebe
parâmetros já validados:

~~~ts
export interface TimelineQueryParams {
  userId: string;
  from?: Date;
  to?: Date;
  type?: string;
  tag?: string;
  cursor?: string;
  limit: number;
}

export interface TimelineEventQuery {
  list(params: TimelineQueryParams): Promise<TimelineEventPageDto>;
}
~~~

A primeira query seleciona a página de events, a linha principal sem data e
itemTypes, usando limit + 1. O cursor aplica:

~~~sql
AND (e.started_at, e.id) < ($cursorStartedAt, $cursorId)
ORDER BY e.started_at DESC, e.id DESC
LIMIT $limitPlusOne
~~~

O filtro de tipo usa EXISTS em event_items. O intervalo preserva:

~~~sql
e.started_at <= $to
AND (e.started_at >= $from OR e.finished_at >= $from)
~~~

Depois carregue tags e interrupções em duas queries por ANY(eventIds). Não faça
JOIN plano nem uma query por evento.

- [ ] **8.6 Implementar DailyOverviewQuery**

A porta é:

~~~ts
export interface DailyOverviewQuery {
  get(params: {
    userId: string;
    date: string;
    timeZone: "America/Sao_Paulo";
  }): Promise<DailyOverviewDto>;
}
~~~

Filtre obrigatoriamente user_id e a sobreposição:

~~~sql
e.started_at <= $dayEnd
AND coalesce(e.finished_at, e.started_at) >= $dayStart
~~~

Implemente-a como união disjunta para aproveitar os dois índices sem alterar o
resultado no fuso fixo America/Sao_Paulo:

~~~sql
SELECT id FROM events
WHERE user_id = $userId AND started_on = $day
UNION ALL
SELECT id FROM events
WHERE user_id = $userId
  AND started_at < $dayStart
  AND finished_at >= $dayStart
~~~

A primeira perna usa events_user_day_idx; a segunda usa
events_user_finished_idx. Evento aberto antigo não entra na segunda perna.

Leia JSONB somente dos itens meal, sleep e training desse dia. Some os cinco
totais escalares de MealItem e agregue micronutrients percorrendo
foodItems. Não recalcule macros de Food vivo.

- [ ] **8.7 Implementar tags e workout**

Antes do corte, copie a porta de tags atual para LegacyTagRepository e faça o
repository Firestore importá-la. TagRepository final contém apenas suggest com
userId. Faça prefix search com LIKE escapando porcentagem, sublinhado e barra
invertida e declare ESCAPE no SQL.

WorkoutCatalog recebe códigos e devolve definições ativas preservando a ordem
solicitada. Código ausente ou inativo gera EventValidationError.

~~~ts
export interface WorkoutDefinition {
  code: WorkoutCode;
  name: string;
  category: "cardio" | "strength" | "free";
  active: boolean;
}

export interface WorkoutCatalog {
  findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]>;
}
~~~

- [ ] **8.8 Rodar integração e typecheck**

~~~powershell
npm run --silent test:postgres
npm run --silent test:ai packages/persistence/src/events/queries
pnpm turbo run typecheck --filter=@repo/persistence --filter=@repo/entities
~~~

- [ ] **8.9 Commit**

~~~powershell
git add packages/entities/src/events/contracts packages/entities/src/events/ports packages/entities/src/ports.ts packages/persistence/src
git commit -m "feat(db): add Event read projections"
~~~

---

## Task 9: cortar contratos e casos de uso para items

**Files:**

- Create: packages/entities/src/events/contracts/event-item.dto.ts
- Modify: todos os contratos em packages/entities/src/events/contracts
- Modify: packages/entities/src/contracts.ts
- Create: packages/entities/src/events/ports/legacy-event-repository.ts
- Modify: packages/entities/src/events/ports/event-repository.ts
- Modify: packages/persistence/src/events/repositories/firestore-event.repository.ts
- Modify: packages/persistence/src/events/mappers/event-document.mapper.ts
- Modify: apps/api/src/events/usecases e testes
- Modify: apps/api/src/events/services e testes
- Create/modify: gateways, skills e testes Meal listados no mapa
- Modify: apps/api/src/events/testing/in-memory-event.repository.ts
- Create: três in-memory ports listados no mapa

**Interfaces:**

- Consumes: agregado, codecs, parser Meal, workout catalog e portas de leitura e
  escrita PostgreSQL.
- Produces: contratos finais `CreateEventInput`, `UpdateEventInput`,
  `EventDetailDto`, `TimelineEventPageDto` e `DailyOverviewDto`, além de use cases
  que sempre recebem o actor autenticado.

- [ ] **9.1 Reescrever primeiro fixtures e testes de casos de uso**

Os testes devem construir Event com items e esperar:

~~~ts
expect(await getEvent.execute({ eventId: event.id }, actor)).toMatchObject({
  revision: 1,
  primaryItemId: mealItem.id,
  items: [
    {
      id: mealItem.id,
      position: 0,
      type: "meal",
      schemaVersion: 1,
      isPrimary: true,
    },
  ],
});

expect(await listTimeline.execute(params, actor)).toEqual({
  items: [timelineCard],
  nextCursor: "opaque-cursor",
});

expect(await daily.execute({ date: "2026-08-31" }, actor)).toMatchObject({
  mealEvents: [{ id: mealEvent.id }],
});
~~~

Adicione testes de create para único principal implícito, múltiplos sem
principal, meal + sleep incompatíveis, training com definição fixa e meal
normalizada pelo parser.

- [ ] **9.2 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai apps/api/src/events/usecases apps/api/src/events/services
~~~

- [ ] **9.3 Implementar contratos finais**

EventDetailDto contém campos comuns, revision, primaryItemId e items ordenados.
TimelineEventCardDto remove type e contém primaryItemId, primaryItemType e
itemTypes; accentColor e iconName também saem. DailyOverviewDto remove
foodEvents e usa mealEvents.

Não exporte classes de domínio por @repo/entities/contracts.

Antes de substituir event-repository.ts, copie sua união e interface atuais
para legacy-event-repository.ts e faça o repository e o mapper Firestore
importarem LegacyEventRepository/LegacyDomainEvent. event-repository.ts então
passa a expor a interface final, estruturalmente igual a
EventAggregateRepository. A Task 13 remove as duas portas temporárias e deixa
uma única definição.

- [ ] **9.4 Refatorar criação**

normalizeCreateEventInput recebe items discriminados. Para cada tipo:

- routine: exige name quando é principal e cria {};
- meal: chama MealParsingGateway, converte food para name, une os antigos mapas
  de micronutrientes somando chaves repetidas, gera IDs, usa inputText como
  descrição do snapshot e calcula MealTotals;
- sleep: aplica zeros atuais;
- training: consulta WorkoutCatalog e copia workoutCode/workoutName.

O nome comum usa input.name quando presente; senão usa Sono, Treino ou o nome
de refeição por horário conforme o principal. O use case chama somente
saveClosingLatestOpen; tags já pertencem à transação do repositório.

- [ ] **9.5 Refatorar atualização**

mergeEventUpdate trabalha com Event, nunca instanceof. Quando items não veio,
preserve o array. Quando veio:

- preserve IDs existentes;
- gere ULID para item sem ID;
- recuse ID que não pertence ao evento;
- use a ordem do array como position;
- recalcule MealTotals e caloriesBurned;
- recarregue workoutCode no WorkoutCatalog e sobrescreva workoutName recebido;
- valide compatibilidade e principal no agregado.

Passe expectedRevision ao repository.update.
mergeEventUpdate chama existing.revise, portanto o objeto enviado ao repositório
já possui expectedRevision + 1; uma leitura posterior precisa devolver essa
revisão nova.

- [ ] **9.6 Refatorar detalhes, timeline, daily, texto e voz**

ListTimelineEventsUseCase e GetDailyOverviewUseCase recebem o actor e delegam
às query ports sempre com actor.userId.
GetEvent mapeia Event para detalhe. Voz/texto produzem CreateEventInput.items e
retornam primaryItemType; utterances antigas de alimentação viram meal.
SuggestTagsUseCase também recebe o actor e nunca aceita userId no input.

Renomeie FoodParsingGateway, prompts, serviços e skill para Meal. Não armazene
modelProvider, modelName, parsedAt ou inputText fora da descrição do MealItem.

- [ ] **9.7 Atualizar os repositórios em memória**

Implemente a semântica final de revisão, transação lógica, fechamento e latest:
ordene todos os eventos primeiro e só então confira se o mais recente está
aberto. EventRepository e TagRepository recebem o mesmo
InMemoryEventDatabase, para que tags gravadas atomicamente com eventos apareçam
nas sugestões. As query ports em memória retornam DTOs já projetados para os
testes.

- [ ] **9.8 Rodar a suíte API focada**

~~~powershell
npm run --silent test:ai apps/api/src/events
pnpm turbo run typecheck --filter=@repo/entities --filter=@repo/api
~~~

Não rode clientes ainda; Tasks 8 a 12 são o corte coordenado.

- [ ] **9.9 Commit**

~~~powershell
git add packages/entities/src apps/api/src/events
git commit -m "refactor(api): use item-based Events"
~~~

---

## Task 10: ligar Nest ao PostgreSQL e autenticar leituras

**Files:**

- Modify: packages/persistence/src/persistence.module.ts
- Modify: packages/persistence/src/index.ts
- Create: apps/api/src/auth/firebase-admin-app.ts
- Modify: apps/api/src/auth/verify-firebase-token.ts
- Modify: apps/api/src/main.ts
- Modify: apps/api/src/common/domain-exception.filter.ts
- Create: apps/api/src/common/domain-exception.filter.test.ts
- Modify: apps/api/src/events/events.module.ts
- Modify: apps/api/src/events/http/events.controller.ts e testes
- Modify: apps/api/src/events/http/tags.controller.ts
- Create: apps/api/src/events/http/tags.controller.test.ts
- Modify: apps/api/src/events/http/events.routing.test.ts
- Modify: apps/api/src/operational/operational-contract.test.ts

**Interfaces:**

- Consumes: casos de uso finais, `DATABASE_URL`, Firebase Auth e providers
  PostgreSQL.
- Produces: HTTP autenticado, filtro `itemType`, cursor/limit, mapeamento
  400/403/404/409, readiness sem query e provider Nest final.

- [ ] **10.1 Escrever testes HTTP de auth e concorrência**

Cubra:

- GET /api/events sem actor: 401;
- GET /api/events ignora/rejeita userId arbitrário e usa actor.userId;
- cursor e limit inválidos: 400;
- GET /api/events/daily sem actor: 401;
- GET /api/tags sem actor: 401;
- detalhe de outro usuário: 403;
- PATCH sem expectedRevision: 400;
- PATCH com revisão divergente: 409;
- evento inexistente: 404;
- rotas daily, ai e voice continuam antes de :eventId.

- [ ] **10.2 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai apps/api/src/events/http apps/api/src/common apps/api/src/operational
~~~

- [ ] **10.3 Mover Firebase Admin para auth**

Copie apenas a inicialização de App para
apps/api/src/auth/firebase-admin-app.ts. verify-firebase-token importa dali.
Não mova Firestore; Firebase Auth continua exatamente como está.

- [ ] **10.4 Implementar providers PostgreSQL**

Exponha tokens:

~~~ts
export const DATABASE = "DATABASE";
export const EVENT_REPOSITORY = "EVENT_REPOSITORY";
export const TAG_REPOSITORY = "TAG_REPOSITORY";
export const TIMELINE_EVENT_QUERY = "TIMELINE_EVENT_QUERY";
export const DAILY_OVERVIEW_QUERY = "DAILY_OVERVIEW_QUERY";
export const WORKOUT_CATALOG = "WORKOUT_CATALOG";
~~~

DATABASE cria PostgresDatabase com process.env.DATABASE_URL e é fechado pelo
hook do provider. Injete as portas corretas nos use cases; não injete query
port no EventRepository.

Depois de loadRootEnv, main.ts chama getDatabaseEnv antes de criar o Nest. Esse
é o momento do corte em que DATABASE_URL passa a ser obrigatório no processo.

- [ ] **10.5 Atualizar controllers e filtro**

list, daily e tags recebem FirebaseAuthGuard e CurrentUser. list aceita from,
to, type, tag, cursor e limit, mas não userId. Limite padrão 50 e máximo 100.

DomainExceptionFilter mapeia:

- EventValidationError para 400;
- EventOwnershipError para 403;
- EventNotFoundError para 404;
- EventRevisionConflictError para 409;
- demais erros para 500.

- [ ] **10.6 Preservar readiness sem consulta**

O pool pode ser construído no bootstrap, mas GET /ready não executa SELECT.
Troque o spy Firestore por um pool fake com query espiada e prove zero chamadas.
O teste injeta DATABASE_URL sintética e não precisa de Docker.

- [ ] **10.7 Rodar API, integração e typecheck**

~~~powershell
npm run --silent test:ai apps/api/src
npm run --silent test:postgres
pnpm turbo run typecheck --filter=@repo/api --filter=@repo/persistence
~~~

- [ ] **10.8 Commit**

~~~powershell
git add packages/persistence/src apps/api/src
git commit -m "feat(api): cut Event APIs to PostgreSQL"
~~~

---

## Task 11: migrar timeline compartilhada e web

**Files:**

- Modify: packages/timeline/src/date-window.ts e teste
- Modify: packages/timeline/src/event-metrics.test.ts
- Modify: packages/timeline/src/group-events-by-day.test.ts
- Modify: packages/timeline/src/index.ts
- Modify: packages/theme/src/tokens.ts, theme.test.ts e oklch.ts
- Modify: apps/web/src/styles/globals.css
- Modify: apps/web/src/styles/theme-tokens.test.ts
- Modify: apps/web/src/lib/tags/tag-color.ts
- Create: apps/web/src/lib/api/authed-fetch.ts e teste
- Modify: apps/web/src/app/[userId]/page.tsx e teste
- Delete: apps/web/src/lib/api/backend.ts
- Modify: apps/web/src/components/events/TimelineList.tsx e teste
- Modify: EventCard, EventDetailsModal, EditEventModal, DayColumn,
  event-visuals e testes
- Create: MealForm.tsx e MealEditForm.tsx
- Create: MealForm.test.tsx, MealEditForm.test.tsx,
  EventDetailsModal.test.tsx e new-event-forms/TagInput.test.tsx
- Modify: demais formulários e TagInput

**Interfaces:**

- Consumes: DTOs finais, `TimelineEventPageDto` e Firebase Auth do cliente.
- Produces: `dayEventsUrl(dayKey, { itemType?, cursor?, limit? })`,
  `authedFetch<T>()`, estado `{ items, nextCursor }` por uid/dia, visuais por
  `primaryItemType` e formulários que enviam `items`/`expectedRevision`.

- [ ] **11.1 Escrever testes das URLs e fetch autenticado**

~~~ts
expect(dayEventsUrl("2026-08-31")).toBe(
  "/api/events?from=2026-08-31T03%3A00%3A00.000Z&to=2026-09-01T02%3A59%3A59.999Z",
);
expect(dayEventsUrl("2026-08-31")).not.toContain("userId");
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining("/api/events?from="),
  expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
  }),
);
~~~

Adicione teste para cursor opaco no URL e 401 local quando Firebase ainda não
tem currentUser.

- [ ] **11.2 Escrever testes dos componentes com o DTO final**

Cubra:

- EventCard usa primaryItemType;
- itemTypes secundários não mudam cor/ícone;
- tipo futuro usa fallback;
- detalhe encontra o item por primaryItemId e renderiza os quatro conhecidos;
- formulário Meal envia items, não type food;
- edição envia expectedRevision e o array completo;
- TimelineList adiciona uma segunda página sem duplicar;
- TagInput envia token.

- [ ] **11.3 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai packages/timeline/src packages/theme/src apps/web/src
~~~

- [ ] **11.4 Remover leitura SSR anônima**

A page calcula somente todayKey e monta TimelineList. TimelineList espera
useCurrentUser fornecer o usuário Firebase e usa authedFetch. O userId da rota
pode continuar como rótulo/navegação, mas nunca entra na query de autorização.
Exclua fetchFromBackend porque não resta consumidor server-side e ele não possui
um token Firebase do usuário.

- [ ] **11.5 Implementar paginação web**

Armazene events e nextCursor por dia. Trocar de dia invalida a resposta anterior
com requestVersion. O botão Carregar mais usa o cursor retornado, concatena por
id e some quando nextCursor é undefined.

- [ ] **11.6 Migrar renderização e formulários**

EventCard e event-visuals usam primaryItemType. Detalhes e edição localizam o
principal em items; não inferem pelo primeiro. Renomeie visualmente Alimentação
para Refeição onde o conceito é MealEvent.

Renomeie o token de cor food para meal em @repo/theme e globals.css, mantendo
os mesmos valores oklch/hex. Atualize o teste que trava as duas paletas juntas;
food continua sendo entidade de catálogo, não tipo visual de evento.

Cada formulário de criação envia um array. Cada formulário de edição preserva
itens não editados e troca somente data do item alvo dentro do array completo.

- [ ] **11.7 Rodar testes e typecheck de web/timeline**

~~~powershell
npm run --silent test:ai packages/timeline/src packages/theme/src apps/web/src
pnpm turbo run typecheck --filter=@repo/timeline --filter=@repo/theme --filter=@repo/web
~~~

- [ ] **11.8 Commit**

~~~powershell
git add packages/timeline packages/theme apps/web
git commit -m "refactor(web): consume item-based Events"
~~~

---

## Task 12: migrar mobile e fechar o corte de contrato

**Files:**

- Modify: apps/mobile/src/lib/api/client.ts
- Create: apps/mobile/src/lib/api/client.test.ts
- Modify: apps/mobile/src/lib/events/use-day-events.ts
- Create: apps/mobile/src/lib/events/timeline-page-cache.ts e teste
- Modify: apps/mobile/src/components/DayTimeline.tsx
- Modify: apps/mobile/src/components/EventCard.tsx
- Modify: apps/mobile/src/components/event-visuals.ts
- Modify: apps/mobile/src/components/TagInput.tsx
- Modify: apps/mobile/src/app/new-event.tsx
- Modify: apps/mobile/src/app/event/[eventId].tsx
- Modify: testes mobile de lógica

**Interfaces:**

- Consumes: a mesma página/cursor da web e o usuário Firebase autenticado.
- Produces: `authedFetch<T>()`, cache `{ items, nextCursor }` por uid/dia,
  `useDayEvents(...).loadMore`, `DayTimeline.onStartReached` e telas item-based.

- [ ] **12.1 Escrever testes de paginação e autenticação**

No helper puro, cubra:

~~~ts
const first = mergeTimelinePage([], {
  items: [eventA, eventB],
  nextCursor: "page-2",
});
const second = mergeTimelinePage(first.items, {
  items: [eventB, eventC],
});
expect(second.items.map((event) => event.id)).toEqual([
  eventA.id,
  eventB.id,
  eventC.id,
]);
~~~

Atualize testes do client para exigir Authorization em timeline e tags.

- [ ] **12.2 Rodar e confirmar a falha**

~~~powershell
npm run --silent test:ai apps/mobile/src
~~~

- [ ] **12.3 Implementar hook e carregamento incremental**

useDayEvents usa authedFetch<TimelineEventPageDto>, guarda nextCursor no cache
por userId/dia e expõe loadMore/loadingMore. Como o backend pagina do mais novo
para o mais antigo e o mobile exibe o dia em ordem crescente, DayTimeline liga
loadMore ao onStartReached, mantém a deduplicação ao inserir eventos no início e
mostra ActivityIndicator no cabeçalho.

apiFetch continua disponível apenas para endpoints realmente públicos; timeline
e TagInput usam authedFetch. Enquanto useCurrentUser ainda não estiver ready, a
tela não monta DayTimeline e não dispara uma falsa falha 401.

- [ ] **12.4 Migrar cards, detalhe e criação**

Card e visuais usam primaryItemType. A tela de detalhe encontra o principal,
renderiza payload conhecido e oferece fallback de ícone, rótulo e cor para tipo
futuro sem indexar Theme por string arbitrária. A tela de criação
envia items. PATCH envia expectedRevision e todos os itens preservados.

- [ ] **12.5 Rodar a primeira verificação global do corte**

~~~powershell
npm run --silent test:ai
pnpm turbo run typecheck
pnpm turbo run build
~~~

Esperado: todas as sete workspaces verdes. Se houver falha, corrija somente a
adaptação de contrato; não inicie a limpeza ainda.

- [ ] **12.6 Commit**

~~~powershell
git add apps/mobile
git commit -m "refactor(mobile): consume item-based Events"
~~~

---

## Task 13: contrair legado Firestore e subclasses

**Files:**

- Delete: todos os arquivos listados em Excluir somente na contração final
- Modify: packages/entities/src/index.ts, contracts.ts e ports.ts
- Modify: packages/persistence/src/index.ts e package.json
- Modify: package.json e pnpm-lock.yaml
- Modify: AGENTS.md
- Preserve: docs/postgres-migration.md como histórico superseded

**Interfaces:**

- Consumes: prova global de que API e clientes finais estão verdes e não
  importam legado.
- Produces: somente o modelo final; remove subclasses, portas temporárias,
  persistência Firestore e importador direto, preservando Firebase Admin Auth.

- [ ] **13.1 Provar que nenhum consumidor usa o legado**

~~~powershell
rg -n "FoodEvent|RoutineEvent|SleepEvent|TrainingEvent|LegacyEvent|LegacyEventRepository|LegacyTagRepository|EventType|Firestore|firestore|getAdminFirestore|foodEvents|type: .food." apps packages package.json AGENTS.md .claude
~~~

Classifique cada ocorrência. Só documentação histórica pode permanecer. Se
apps ou packages aparecerem, pare e remova o import antes de excluir arquivos.

- [ ] **13.2 Remover subclasses e contratos antigos**

Exclua legacy-event e as quatro subclasses, event-type e exports associados.
O único Event público é o agregado concreto; meal, sleep, training e routine
são códigos de EventItem.

- [ ] **13.3 Remover persistência Firestore**

Exclua DAO, repositories, mappers, Firebase/Firestore e testes antigos do
package. Remova firebase-admin das peer/dev dependencies de persistence, mas
mantenha firebase-admin em apps/api para Auth.

Exclua firebase.rules, firestore.indexes.json, firebase.json e scripts
firebase:indexes/firebase:rules. Isso não apaga o projeto nem documentos
externos.

- [ ] **13.4 Aposentar o importador direto**

Exclua a skill Toggl bulk import inteira, pois ela serializa documentos
Firestore diretamente e não pode cumprir o novo contrato autenticado sem uma
nova especificação de importação. A exclusão é recuperável por git; não crie
endpoint administrativo de importação neste escopo.

- [ ] **13.5 Atualizar AGENTS.md**

Substitua a seção Firestore por:

- DATABASE_URL e Compose local;
- db:generate e db:migrate;
- migrations como fonte da verdade;
- test:postgres requer Docker;
- Firebase Admin existe somente para Auth;
- leituras web autenticadas acontecem no cliente, pois Server Components não
  possuem o ID token Firebase;
- proibição de editar migration já implantada;
- nenhuma migration de documentos Firestore.

- [ ] **13.6 Rodar busca de contração e suíte global**

~~~powershell
rg -n "FoodEvent|RoutineEvent|SleepEvent|TrainingEvent|LegacyEvent|LegacyEventRepository|LegacyTagRepository|EventType|getAdminFirestore|admin-firestore|firestore-event|foodEvents" apps packages package.json AGENTS.md .claude
npm run --silent test:ai
npm run --silent test:postgres
pnpm turbo run typecheck
pnpm turbo run build
~~~

Esperado: rg sem ocorrências de código legado e todos os gates verdes.

- [ ] **13.7 Commit**

~~~powershell
git add -A
git restore --staged firebase-debug.log
git commit -m "chore(db): remove Firestore persistence"
~~~

---

## Task 14: provar comportamento, desempenho e operação

**Files:**

- Modify: packages/persistence/src/integration/postgres.integration.test.ts
- Modify: docs/superpowers/specs/2026-08-31-postgres-event-items-design.md
  somente se a implementação exigir uma correção factual; não mude decisões
  aprovadas para acomodar código.

**Interfaces:**

- Consumes: aplicação final, migrations e PostgreSQL real.
- Produces: provas reproduzíveis de query count, payload, memória, tempo,
  índices, planos e gates globais; não altera decisões para acomodar o código.

- [ ] **14.1 Adicionar prova de query count**

Instrumente o logger do Drizzle no teste de timeline. Para uma página com 50
eventos, prove número constante de round trips:

1. página, principal e itemTypes;
2. tags;
3. interrupções.

O número não pode crescer com a quantidade de eventos.
Inspecione também a primeira instrução capturada e prove que ela não seleciona
event_items.data.

- [ ] **14.2 Provar índices existentes**

Consulte pg_indexes e espere exatamente os índices relevantes:

~~~ts
expect(indexNames).toEqual(
  expect.arrayContaining([
    "events_timeline_cursor_idx",
    "events_user_finished_idx",
    "events_user_day_idx",
    "event_items_one_primary_idx",
    "event_items_type_event_idx",
    "tags_user_name_prefix_idx",
  ]),
);
expect(indexMethods.filter((index) => index.method === "gin")).toEqual([]);
~~~

- [ ] **14.3 Rodar EXPLAIN em dados representativos**

No teste real, insira pelo menos 5.000 eventos distribuídos entre dois usuários,
rode ANALYZE e capture EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) para timeline e
overview. Afirme que o plano contém events_timeline_cursor_idx na timeline e
events_user_day_idx no overview. Não fixe tempos absolutos dependentes da
máquina.

- [ ] **14.4 Rodar todos os gates finais**

~~~powershell
npm run --silent test:ai
npm run --silent test:postgres
pnpm turbo run typecheck
pnpm turbo run build
docker compose -f infra/docker-compose.local.yml config
~~~

Registre no comentário do commit os quatro resultados exatos. Não declare
conclusão se qualquer comando falhar ou se a integração tiver sido pulada.

- [ ] **14.5 Revisão manual contra a especificação**

Confirme:

- Event sem subclasses e com exatamente um principal;
- array na API e linha por item no banco;
- meal/sleep/training incompatíveis hoje;
- Food e Meal globais/privados, sem endpoints antecipados;
- snapshots não propagam alterações;
- workout fixo e seeded;
- revision e 409;
- timeline paginada sem payload e filtro em qualquer item;
- daily isolado por usuário;
- Firebase apenas Auth;
- nenhum documento Firestore apagado.

- [ ] **14.6 Commit**

~~~powershell
git add packages/persistence/src/integration/postgres.integration.test.ts docs/superpowers/specs/2026-08-31-postgres-event-items-design.md
git commit -m "test(db): prove PostgreSQL migration"
~~~

---

## Critério de parada

Pare quando a Task 14 estiver verde e o branch contiver somente o modelo final.
Não implemente favoritos, endpoints/telas de catálogo, preços, publicação,
importação global, dual-write ou migração de documentos Firestore. Esses itens
exigem especificações separadas.
