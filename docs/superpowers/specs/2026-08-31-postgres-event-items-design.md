# PostgreSQL, catálogos e itens de evento — especificação

**Estado:** aprovado.

**Objetivo:** substituir a persistência Firestore por PostgreSQL e, ao mesmo
tempo, trocar a hierarquia de eventos por um agregado Event com itens
heterogêneos, snapshots históricos e catálogos reutilizáveis.

**Decisão central:** o domínio e a API enxergam Event.items como um array. No
PostgreSQL, cada item ocupa uma linha de event_items e possui um payload JSONB
independente. Não existe uma tabela de detalhe por tipo de item.

---

## 1. Escopo

Esta entrega inclui:

- uma única entidade Event, sem subclasses por tipo;
- EventItem com identidade, posição, tipo, versão e payload;
- MealItem, SleepItem, TrainingData e RoutineData;
- Food e Meal como entidades de catálogo;
- FoodItem como snapshot imutável dentro de Meal;
- workout como catálogo global e fixo;
- catálogos globais e catálogos privados por usuário;
- PostgreSQL, Drizzle, migrations e testes de integração;
- persistência transacional de eventos, itens, tags e interrupções;
- projeções específicas para timeline e overview diário;
- paginação da timeline por cursor;
- adaptação dos contratos da API, web e mobile;
- remoção do Firestore como banco da aplicação;
- permanência do Firebase Auth.

Esta entrega não inclui:

- telas ou endpoints completos de catálogo;
- favoritos;
- publicação ou compartilhamento de conteúdo privado;
- preço ou histórico de preços;
- importação de uma base global de alimentos e refeições;
- painel administrativo para o catálogo global;
- migração de documentos existentes do Firestore.

As tabelas de catálogo já suportam escopo global e privado. Funcionalidades
sem consumidor nesta entrega não serão implementadas antecipadamente.

---

## 2. Princípios do modelo

Existem três níveis, com ciclos de vida independentes:

1. **Catálogo mutável:** Food, Meal e workout representam a informação atual.
2. **Modelo reutilizável:** Meal guarda FoodItem[] como uma receita estática.
3. **Ocorrência histórica:** EventItem guarda o snapshot usado naquele evento.

Copiar é intencional. Uma referência de origem informa de onde o snapshot veio,
mas nunca participa da leitura histórica.

As regras de propagação são:

~~~text
editar Food       -> não altera Meal nem Event
editar Meal       -> não altera Event
editar EventItem  -> não altera Food, Meal ou outro Event
~~~

Uma alteração direta em um evento pode substituir seu próprio snapshot. A
imutabilidade é em relação à fonte, não uma proibição de o proprietário corrigir
o evento.

---

## 3. Modelo de domínio

### 3.1 Event

Event é a única raiz de agregado:

~~~ts
interface EventProps {
  id: string;
  revision: number;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  missed: boolean;
  priority: "urgent" | "normal" | "flexible";
  tags: string[];
  interruptions: Interruption[];
  items: EventItem[];
  primaryItemId: string;
}
~~~

FoodEvent, MealEvent, SleepEvent, TrainingEvent e RoutineEvent deixam de
existir como subclasses. Fábricas específicas podem preparar entradas, mas
sempre devolvem Event.

Event garante:

- pelo menos um item;
- exatamente um item principal;
- primaryItemId pertencente ao próprio evento;
- IDs e posições de item únicos;
- finishedAt ausente ou maior/igual a startedAt;
- payload válido para o tipo e a versão;
- compatibilidade entre todos os itens;
- escolha de outro principal na mesma operação que remove o principal atual.

### 3.2 EventItem

~~~ts
interface EventItem<TData = unknown> {
  id: string;
  position: number;
  type: string;
  schemaVersion: number;
  isPrimary: boolean;
  data: TData;
}
~~~

Os tipos iniciais são routine, meal, sleep e training. meal, sleep e training
são incompatíveis entre si: no máximo um membro desse conjunto pode aparecer
no mesmo evento. Outros tipos podem coexistir conforme sua definição.

Cada tipo possui uma definição registrada:

~~~ts
interface EventItemDefinition<TData> {
  type: string;
  currentSchemaVersion: number;
  parse(data: unknown, schemaVersion: number): TData;
  incompatibleWith: readonly string[];
}
~~~

O tipo é texto no banco, não enum PostgreSQL. Adicionar um tipo exige contrato,
validador e testes no código, mas não uma migration que crie tabela ou coluna.

### 3.3 Formatos iniciais

FoodItem é o snapshot de um alimento aplicado a uma porção:

~~~ts
interface FoodItem {
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
~~~

mainMicronutrients e otherData são substituídos por micronutrients. Não existe
um mapa agregado de micronutrientes em Meal ou MealItem.

~~~ts
interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

interface MealItem {
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
}

interface SleepItem {
  trackedSleepTime: number;
  score: number;
}
~~~

As unidades e faixas de trackedSleepTime e score continuam sem CHECK até serem
definidas pelo produto.

TrainingData contém uma lista ordenada de snapshots de workout. Cada snapshot
guarda o código e o nome da definição de origem, além dos valores daquela
ocorrência. Cardio mantém pace e distance; musculação mantém as séries; treino
livre mantém calorias e duração. Nenhum evento consulta workout para reconstruir
um treino passado.

RoutineData é um objeto vazio validado. Ele permite que todo Event tenha ao
menos um item e um principal.

---

## 4. Catálogos

### 4.1 Escopo híbrido

Food e Meal usam:

~~~ts
type CatalogScope = "global" | "user";

interface CatalogOwnership {
  scope: CatalogScope;
  ownerUserId?: string;
  revision: number;
}
~~~

As combinações válidas são:

- global: ownerUserId ausente; leitura por qualquer usuário autenticado;
- user: ownerUserId obrigatório; leitura e escrita somente pelo proprietário.

Usuários não alteram registros globais. Registros privados não são descobertos
por outros usuários. A promoção de um registro privado para global não faz
parte desta entrega.

### 4.2 Food

Food representa valores de referência atuais:

- nome;
- porção e peso de referência;
- calorias;
- carboidratos, proteínas, gordura e fibras;
- micronutrients como mapa JSONB de chave aberta;
- scope, ownerUserId, revision e timestamps.

Campos escalares conhecidos são colunas. O único mapa aberto do catálogo Food é
micronutrients.

Editar Food incrementa revision. FoodItem já criado não é recalculado.

### 4.3 Meal

Meal contém:

- nome e descrição;
- FoodItem[] em food_items JSONB;
- os cinco totais escalares de MealTotals;
- scope, ownerUserId, revision e timestamps.

Ao criar ou editar Meal, a aplicação lê as Food selecionadas, aplica as porções,
cria FoodItem autocontidos, recalcula os totais e grava tudo atomicamente.

Editar Food não atualiza Meal. Atualizar uma receita exige uma edição explícita
de Meal, que substitui food_items e incrementa revision.

### 4.4 workout

workout é global, fixo e mantido por seed/migration. A primeira seed contém os
códigos já suportados: treadmill, running, weightlifting e free. A tabela guarda
código, nome, categoria e indicação de ativo.

O item de treino copia os campos necessários. O ID ou código de workout dentro
do snapshot é proveniência, não relação viva.

### 4.5 Favoritos

Favoritos são uma funcionalidade posterior. Quando implementados, usarão duas
tabelas com FKs reais, user_favorite_foods e user_favorite_meals. Não será usada
uma relação polimórfica genérica.

---

## 5. Persistência PostgreSQL

Todos os IDs de domínio continuam sendo ULIDs com char(26). Não há tabela users:
user_id é o uid do Firebase Auth e permanece text sem FK.

~~~sql
CREATE TYPE event_priority AS ENUM ('urgent', 'normal', 'flexible');
CREATE TYPE catalog_scope AS ENUM ('global', 'user');
~~~

### 5.1 events

~~~sql
CREATE TABLE events (
  id          char(26) PRIMARY KEY,
  revision    integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  user_id     text        NOT NULL,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  missed      boolean     NOT NULL DEFAULT false,
  priority    event_priority NOT NULL DEFAULT 'normal',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  started_on  date GENERATED ALWAYS AS
                ((started_at AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  CONSTRAINT events_finished_after_started
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);
~~~

events não possui type nem um payload JSONB.

Índices:

~~~sql
CREATE INDEX events_timeline_cursor_idx
  ON events (user_id, started_at DESC, id DESC);

CREATE INDEX events_user_finished_idx
  ON events (user_id, finished_at)
  WHERE finished_at IS NOT NULL;

CREATE INDEX events_user_day_idx
  ON events (user_id, started_on);
~~~

Não existe índice único de evento aberto por usuário. Escritas fora de ordem
podem deixar um evento antigo aberto quando fechá-lo produziria finished_at
anterior a started_at; essa semântica atual será preservada.

### 5.2 event_items

~~~sql
CREATE TABLE event_items (
  id             char(26) PRIMARY KEY,
  event_id       char(26) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position       smallint NOT NULL CHECK (position >= 0),
  type           text     NOT NULL,
  schema_version integer  NOT NULL CHECK (schema_version >= 1),
  is_primary     boolean  NOT NULL DEFAULT false,
  data           jsonb    NOT NULL,
  CONSTRAINT event_item_data_is_object
    CHECK (jsonb_typeof(data) = 'object'),
  UNIQUE (event_id, position)
);

CREATE UNIQUE INDEX event_items_one_primary_idx
  ON event_items (event_id)
  WHERE is_primary;

CREATE INDEX event_items_type_event_idx
  ON event_items (type, event_id);
~~~

O índice parcial garante no máximo um principal. A existência de exatamente um
principal depende do agregado e da transação, pois é uma regra entre linhas.

O array da API é reconstruído com ORDER BY position. Cada item ocupa uma linha,
portanto sua edição não regrava os outros itens.

Nenhum GIN genérico será criado sobre data. Um índice JSONB só será adicionado
quando existir uma consulta concreta que o justifique.

### 5.3 Catálogos

~~~sql
CREATE TABLE food (
  id                           char(26) PRIMARY KEY,
  scope                        catalog_scope NOT NULL,
  owner_user_id                text,
  revision                     integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  name                         text NOT NULL,
  reference_portion            text NOT NULL,
  reference_weight_grams       numeric(10,2) NOT NULL,
  calories_kcal                numeric(10,2) NOT NULL,
  carbohydrates_grams          numeric(10,2) NOT NULL,
  proteins_grams               numeric(10,2) NOT NULL,
  total_fat_grams              numeric(10,2) NOT NULL,
  fiber_grams                  numeric(10,2) NOT NULL,
  micronutrients               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_scope_owner CHECK (
    (scope = 'global' AND owner_user_id IS NULL)
    OR (scope = 'user' AND owner_user_id IS NOT NULL)
  ),
  CONSTRAINT food_micronutrients_is_object
    CHECK (jsonb_typeof(micronutrients) = 'object'),
  CONSTRAINT food_nutrition_nonnegative CHECK (
    reference_weight_grams >= 0
    AND calories_kcal >= 0
    AND carbohydrates_grams >= 0
    AND proteins_grams >= 0
    AND total_fat_grams >= 0
    AND fiber_grams >= 0
  )
);

CREATE INDEX food_global_name_idx
  ON food (name)
  WHERE scope = 'global';

CREATE INDEX food_owner_name_idx
  ON food (owner_user_id, name)
  WHERE scope = 'user';

CREATE TABLE meal (
  id                       char(26) PRIMARY KEY,
  scope                    catalog_scope NOT NULL,
  owner_user_id            text,
  revision                 integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  name                     text NOT NULL,
  description              text NOT NULL DEFAULT '',
  food_items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_calories_kcal      numeric(10,2) NOT NULL DEFAULT 0,
  total_protein_grams      numeric(10,2) NOT NULL DEFAULT 0,
  total_carbohydrate_grams numeric(10,2) NOT NULL DEFAULT 0,
  total_fat_grams          numeric(10,2) NOT NULL DEFAULT 0,
  total_fiber_grams        numeric(10,2) NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_scope_owner CHECK (
    (scope = 'global' AND owner_user_id IS NULL)
    OR (scope = 'user' AND owner_user_id IS NOT NULL)
  ),
  CONSTRAINT meal_food_items_is_array
    CHECK (jsonb_typeof(food_items) = 'array'),
  CONSTRAINT meal_totals_nonnegative CHECK (
    total_calories_kcal >= 0
    AND total_protein_grams >= 0
    AND total_carbohydrate_grams >= 0
    AND total_fat_grams >= 0
    AND total_fiber_grams >= 0
  )
);

CREATE INDEX meal_global_name_idx
  ON meal (name)
  WHERE scope = 'global';

CREATE INDEX meal_owner_name_idx
  ON meal (owner_user_id, name)
  WHERE scope = 'user';

CREATE TABLE workout (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  category   text NOT NULL CHECK (category IN ('cardio', 'strength', 'free')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
~~~

Não haverá UNIQUE global apenas por nome: marca, apresentação e outras
características futuras podem produzir alimentos homônimos.

O seed inicial de workout é:

| code | name | category |
|---|---|---|
| treadmill | Esteira | cardio |
| running | Corrida | cardio |
| weightlifting | Musculação | strength |
| free | Livre | free |

### 5.4 Dados comuns

~~~sql
CREATE TABLE event_interruptions (
  id          char(26) PRIMARY KEY,
  event_id    char(26) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position    smallint NOT NULL CHECK (position >= 0),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  CONSTRAINT interruption_finished_after_started
    CHECK (finished_at >= started_at),
  UNIQUE (event_id, position)
);

CREATE INDEX event_interruptions_event_idx
  ON event_interruptions (event_id, position);

CREATE TABLE tags (
  id         char(26) PRIMARY KEY,
  user_id    text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name),
  CONSTRAINT tag_name_normalized
    CHECK (name = lower(btrim(name)) AND name <> '')
);

CREATE INDEX tags_user_name_prefix_idx
  ON tags (user_id, name text_pattern_ops);

CREATE TABLE event_tags (
  event_id char(26) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag_id   char(26) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX event_tags_tag_idx
  ON event_tags (tag_id, event_id);
~~~

event_interruptions é ordenada por position e possui CHECK de intervalo. Tags
são por usuário, com UNIQUE (user_id, name).

Filhos de Event usam ON DELETE CASCADE. IDs de origem guardados dentro de JSONB
não são FKs e sobrevivem à remoção da fonte.

---

## 6. Escritas e concorrência

### 6.1 Catálogos

Food e Meal usam concorrência otimista:

~~~sql
UPDATE meal
SET ..., revision = revision + 1, updated_at = now()
WHERE id = $id
  AND revision = $expectedRevision;
~~~

Zero linhas significa inexistência, falta de acesso ou conflito. O caminho de
erro distingue os casos sem revelar registros privados de outro usuário.
Conflito de revision retorna HTTP 409.

### 6.2 Eventos

Criar ou atualizar Event grava, na mesma transação:

- events;
- event_items;
- event_interruptions;
- tags necessárias;
- event_tags.

O domínio valida o conjunto completo antes da gravação. O UPDATE de events usa
user_id e expectedRevision; zero linhas segue a mesma política de conflito e
ownership.

Atualizações de itens podem apagar e reinserir as linhas daquele evento dentro
da transação, desde que preservem os IDs recebidos. Uma otimização incremental
só será adotada se medições mostrarem necessidade.

### 6.3 Fechamento do evento anterior

saveClosingLatestOpen mantém a semântica atual:

1. obter advisory lock transacional pelo userId;
2. ler somente o evento mais recente do usuário;
3. fechá-lo apenas se estiver aberto e o fechamento não for anterior ao início;
4. inserir o novo Event e todos os filhos;
5. confirmar tudo junto.

O lock impede duas criações simultâneas de observarem o mesmo estado.

---

## 7. Leitura e performance

### 7.1 Portas

A persistência separa agregado e projeções:

~~~ts
interface EventRepository {
  save(event: Event): Promise<void>;
  saveClosingLatestOpen(event: Event, finishedAt: Date): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
  findLatestOpenByUserId(userId: string): Promise<Event | null>;
}

interface TimelineEventPageDto {
  items: TimelineEventCardDto[];
  nextCursor?: string;
}

interface TimelineEventQuery {
  list(params: TimelineQueryParams): Promise<TimelineEventPageDto>;
}

interface DailyOverviewQuery {
  get(params: {
    userId: string;
    date: string;
    timeZone: string;
  }): Promise<DailyOverviewDto>;
}
~~~

Timeline e overview não hidratam Event para depois descartar dados.

### 7.2 Timeline

A timeline:

1. filtra e pagina events;
2. junta apenas a linha principal de event_items sem selecionar data;
3. carrega tags e interrupções em batches pelos IDs da página;
4. devolve primaryItemType, primaryItemId e itemTypes.

O cursor é o par (started_at, id), ordenado de forma descendente. OFFSET
profundo não será usado. A resposta é um envelope com items e nextCursor; o
cursor é opaco para os clientes e só é emitido quando existe outra página.

O filtro de tipo significa “o evento contém um item deste tipo”, não apenas “o
item principal tem este tipo”.

O predicado de intervalo preserva a regra atual:

~~~sql
e.started_at <= $to
AND (e.started_at >= $from OR e.finished_at >= $from)
~~~

Um evento aberto iniciado antes da janela não é assumido como ainda ativo e não
entra. Limites parciais aplicam apenas sua parte correspondente.

### 7.3 Overview diário

O overview sempre recebe userId autenticado. A consulta diária usa a
sobreposição:

~~~sql
e.user_id = $userId
AND e.started_at <= $dayEnd
AND coalesce(e.finished_at, e.started_at) >= $dayStart
~~~

No PostgreSQL, esse predicado pode ser executado como união disjunta entre
eventos com started_on igual ao dia e eventos iniciados antes que possuem
finished_at após o início do dia. A forma é equivalente no fuso fixo da
timeline, permite usar events_user_day_idx e events_user_finished_idx e mantém
eventos abertos antigos fora do resultado.

Totais escalares de MealItem são lidos diretamente do snapshot. Micronutrientes
são agregados a partir de foodItems[*].micronutrients. SleepItem e TrainingData
são carregados apenas para o dia consultado.

Como a consulta é limitada a um usuário e um dia, a primeira implementação pode
agregar o mapa aberto no processo da API. A consulta e a projeção ficam
encapsuladas para que a agregação possa descer ao SQL sem alterar controllers ou
clientes se os benchmarks mostrarem necessidade.

### 7.4 Custo ao adicionar tipos

Adicionar tipos não alarga events e não adiciona joins à timeline. O custo
depende apenas dos itens presentes na página ou no detalhe consultado.

Não será feito um JOIN plano entre events, itens, tags e interrupções. A página
é selecionada primeiro; relações comuns são carregadas em batch. O número de
round trips não cresce com o número de eventos da página.

---

## 8. Contratos e aplicações

CreateEventInput e UpdateEventInput passam a trabalhar com itens discriminados.
Em criação com um único item, ele é o principal por padrão. Em criação com mais
de um, exatamente um precisa ser marcado como principal.

CreateEventInput mantém as datas sob responsabilidade do servidor: formulários
começam no instante atual e os fluxos de texto/voz podem fornecer a janela
resolvida internamente. O cliente não passa startedAt nem finishedAt na criação.

UpdateEventInput substitui o array completo de itens quando items é enviado. A
ordem do array define position; IDs existentes são preservados, IDs ausentes são
gerados para itens novos e um ID que pertença a outro evento é recusado. Toda
atualização exige expectedRevision. Ausência ou divergência nunca cai em
last-write-wins: entrada inválida retorna 400 e conflito retorna 409.

EventDetailDto devolve todos os itens ordenados. TimelineEventCardDto deixa de
ter um type único e passa a devolver:

- primaryItemId;
- primaryItemType;
- itemTypes;
- os campos comuns já existentes.

accentColor e iconName deixam o DTO: são apresentação derivada de
primaryItemType pelos event-visuals de cada aplicativo.

GET /api/events devolve TimelineEventPageDto, com items e nextCursor. Web e
mobile tratam o cursor como opaco e não o constroem a partir dos campos do
último evento.

DailyOverviewDto troca foodEvents por mealEvents. Os rótulos visuais em
português continuam nos aplicativos, mas usam primaryItemType.

Web e mobile continuam sem regra de negócio. Eles importam somente contratos e
delegam validação de compatibilidade à API.

GET /api/events, GET /api/events/daily e sugestões de tags usam o usuário
autenticado. userId arbitrário não será aceito por query string. Rotas estáticas
do controller Nest continuam declaradas antes de :eventId.

---

## 9. Firebase e corte para PostgreSQL

Firebase Auth permanece. O Firebase Admin usado para verificar tokens sai de
@repo/persistence e passa para apps/api.

@repo/persistence troca internamente:

- DAOs e repositories Firestore por PostgreSQL;
- FIRESTORE por um pool pg;
- document mappers por row/snapshot mappers.

O pool fecha nos hooks de shutdown. DATABASE_URL vem do .env da raiz.

Como a implantação é greenfield:

- não há export/import do Firestore;
- status legado não é migrado;
- missed e priority nascem NOT NULL com defaults;
- firestore.rules, firestore.indexes.json e os scripts de deploy são removidos
  após o corte;
- o importador que escreve diretamente no Firestore não permanece ativo.

Não haverá package paralelo nem feature flag de persistência.

---

## 10. Erros e autorização

Regras de ownership vivem nos use cases/repositories, não apenas nos
controllers:

- Event só é lido ou alterado pelo proprietário;
- Food e Meal globais são somente leitura para usuários;
- Food e Meal privados são visíveis e mutáveis somente pelo proprietário;
- consultas de catálogo usam scope global OU owner_user_id atual.

Payload inválido, combinação incompatível ou ausência de principal retorna HTTP
400. Falha de autenticação retorna 401. Ownership retorna 403 somente quando a
política permite revelar a existência; catálogos privados de outro usuário são
tratados como 404. Conflito de revision retorna 409.

Na leitura:

- versão corrente é validada e carregada;
- versão antiga conhecida é convertida em memória por upgrades explícitos;
- versão futura desconhecida ou JSON inválido é corrupção de persistência;
- leitura nunca regrava silenciosamente o snapshot.

---

## 11. Verificação e critérios de aceite

### Domínio

- Event recusa zero itens;
- Event recusa zero ou dois principais;
- Event recusa primaryItemId externo;
- meal, sleep e training são mutuamente incompatíveis;
- tipo futuro compatível pode coexistir;
- remover o principal exige substituição atômica;
- codecs recusam payload e schemaVersion inválidos;
- upgrades conhecidos preservam o significado do snapshot;
- totais de Meal são recalculados a partir de FoodItem.

### Isolamento de snapshots

- editar Food não altera FoodItem já salvo em Meal;
- editar Meal não altera MealItem já salvo em EventItem;
- editar EventItem não altera catálogo nem outro evento;
- source IDs e revisions são preservados apenas como proveniência.

### Persistência com PostgreSQL real

- transação inválida não deixa events ou filhos parciais;
- índice parcial recusa dois principais;
- revision concorrente produz um sucesso e um HTTP 409;
- escopo global é legível e não é gravável por usuário;
- conteúdo privado não é visível por outro usuário;
- paginação por cursor não duplica nem pula registros estáveis;
- filtro encontra tipo principal ou secundário;
- semântica de intervalo e closesInThePast é preservada;
- create concorrente respeita o advisory lock;
- tags de usuários diferentes não se misturam.

### Performance

- timeline não seleciona event_items.data;
- tags e interrupções são carregadas em batch, sem N+1;
- EXPLAIN (ANALYZE, BUFFERS) confirma o índice de cursor;
- filtro de tipo usa o índice de event_items;
- cenários com 20, 100 e 1.000 eventos medem tempo, bytes e memória;
- cenários incluem múltiplos itens e snapshots grandes;
- nenhum limite fixo de milissegundos é compartilhado entre máquinas; regressões
  são avaliadas comparando as estratégias no mesmo ambiente.

### Gates do repositório

- npm run --silent test:ai;
- pnpm turbo run typecheck;
- pnpm turbo run build;
- exercício ponta a ponta das rotas atuais de eventos e overview.

---

## 12. Limites preservados do monorepo

- apps/web e apps/mobile importam somente contratos de @repo/entities;
- regra de negócio permanece em @repo/entities e apps/api;
- @repo/persistence implementa portas de @repo/entities;
- @repo/timeline continua independente de persistência;
- packages não dependem de apps;
- web continua usando o rewrite do Next;
- mobile continua falando diretamente com a API.

Esta especificação é a fonte de verdade para o plano de implementação. O plano
deve decompor as mudanças em tarefas TDD pequenas, manter o sistema verificável
ao fim de cada tarefa e não antecipar as funcionalidades declaradas fora de
escopo.
