# Plano de implementação — Frontend da timeline `/[userId]`

## Objetivo

Página pública `/{userId}` que renderiza a lista de eventos daquele usuário, agrupada por dia,
com infinite scroll por janelas de 8 dias para trás. Sem criação/edição de eventos nesta etapa —
apenas leitura e renderização.

---

## 1. Diagnóstico: o que existe hoje

### `timeline_project` (destino) — Next.js 16 / App Router

| Item | Estado |
|---|---|
| Backend de leitura | ✅ Pronto: `GET /api/events?userId=&from=&to=&type=&tag=` |
| `ListTimelineEventsController` | ✅ Valida `userId`, `from`, `to`, `type`; **sem auth** (já é público) |
| `TimelineEventCardDto` | ✅ Já traz `durationLabel`, `tags`, `interruptions` formatados |
| Índice Firestore `userId ASC + startedAt DESC` | ✅ Existe — cobre o filtro por range de data |
| Página `/[userId]` | ❌ Não existe → causa do 404 |
| Tailwind / design system | ❌ `globals.css` é CSS puro, sem Tailwind |
| `src/components/{auth,events,providers}` | Diretórios vazios |
| Alias `@/*` → `./src/*` | ✅ Configurado no `tsconfig.json` e no `vitest.config.ts` |
| Testes | Vitest + Testing Library + jsdom |

### `my-daily-flow` (origem dos componentes) — TanStack Start / Vite

Componentes a portar, em `src/components/routine/`:

- `RoutineTimeline.tsx` — orquestra dias + `IntersectionObserver` + dois layouts
- `DayColumn.tsx` — cabeçalho do dia (data, "Hoje", contagem, horas) + lista de cards
- `EventCard.tsx` — card com ícone, horário, duração, tags, detalhes expansíveis, interrupções
- `DaySkeleton.tsx` — placeholder de carregamento
- `event-visuals.ts` — ícones (lucide) e classes por tipo

Dependem de: Tailwind v4, `cn()` (clsx + tailwind-merge), `lucide-react`, e os tokens de
design em `styles.css` (`--sleep`, `--workout`, `--meal`, `--common`, `--shadow-card`, etc.).

---

## 2. Os três descompassos a resolver

### 2.1 Vocabulário de tipos

| Backend (`EventType`) | my-daily-flow | Decisão |
|---|---|---|
| `routine` | `common` | Renomear tokens para o vocabulário do backend |
| `food` | `meal` | idem |
| `training` | `workout` | idem |
| `sleep` | `sleep` | igual |

Adotar `routine \| food \| training \| sleep` em todo o frontend. Isso elimina uma camada de
mapeamento e mantém um único vocabulário no projeto. As variáveis CSS viram
`--routine`, `--food`, `--training`, `--sleep`.

### 2.2 Formato dos dados

`TimelineEventCardDto` (API) → view model do card:

| DTO | Card | Transformação |
|---|---|---|
| `name` | `title` | direto |
| `startedAt` (ISO) | `start` `"HH:MM"` | formatar em `America/Sao_Paulo` |
| `finishedAt?` (ISO) | `end` `"HH:MM"` | formatar; se ausente → `"—"` |
| `durationLabel` | duração | **usar direto** (já formatado no backend) |
| — | `status` | derivar: sem `finishedAt` → `running`; com → `done` |
| `interruptions[].durationLabel` | `"N min"` | usar o label do backend em vez de recalcular |
| `type` | ícone/cor | via `event-visuals` |
| `accentColor` / `iconName` | — | **não usados** nesta etapa (o `type` já resolve) |

### 2.3 Agrupamento por dia

A API devolve lista plana ordenada por `startedAt DESC`. O agrupamento em dias acontece no
frontend, usando o fuso `America/Sao_Paulo` para a fronteira do dia — mesma regra que o
`listByDay` do backend já aplica.

---

## 3. Paginação — janelas de 8 dias

```
janela 0:  from = início(hoje − 7)   →  to = fim(hoje)          (hoje + 7 anteriores)
janela 1:  from = início(hoje − 15)  →  to = fim(hoje − 8)
janela n:  from = início(hoje − 8n − 7) → to = fim(hoje − 8n)
```

Não exige mudança no backend — `from`/`to` já existem e o índice composto cobre a query.

**Condição de parada:** após **3 janelas consecutivas vazias** (≈24 dias sem nenhum evento),
o frontend considera o histórico encerrado e para de observar o sentinel. O número fica em uma
constante nomeada para ajuste fácil.

---

## 4. Arquivos

### Novos

```
postcss.config.mjs                          # plugin @tailwindcss/postcss

src/lib/
  utils.ts                                  # cn() — portado
  timeline/
    date-window.ts                          # cálculo das janelas de 8 dias
    format-date.ts                          # shortDate/longDate/weekday/hora em pt-BR
    group-events-by-day.ts                  # DTO[] → TimelineDay[]
    timeline-day.ts                         # tipos TimelineDay / TimelineEventView

src/components/events/
  event-visuals.ts                          # ícones + classes por EventType (backend)
  EventCard.tsx                             # portado, consome TimelineEventView
  DayColumn.tsx                             # portado
  DaySkeleton.tsx                           # portado sem alteração
  TimelineList.tsx                          # "use client" — infinite scroll + fetch

src/app/[userId]/
  page.tsx                                  # server component, SSR da janela 0
```

### Alterados

```
package.json                # + tailwindcss, @tailwindcss/postcss, tw-animate-css,
                            #   clsx, tailwind-merge, lucide-react
src/styles/globals.css      # tokens de design portados do my-daily-flow
src/app/layout.tsx          # metadata da página (título dinâmico opcional)
```

### Intocados

Todo `src/models/**` e `src/app/api/**` permanecem como estão. Nenhuma mudança de backend.

---

## 5. Fluxo de dados

```
/{userId}  (server component)
   │
   ├─ chama ListTimelineEventsUseCase direto (via factory admin)
   │  com from/to da janela 0                       → SSR, sem round-trip HTTP
   │
   └─ passa os DTOs como prop inicial para
      <TimelineList userId initialEvents initialWindow={0} />   ("use client")
          │
          ├─ agrupa em dias e renderiza DayColumn/EventCard
          │
          └─ IntersectionObserver no sentinel
                 → fetch("/api/events?userId=…&from=…&to=…")  janela n+1
                 → concatena, reagrupa, incrementa n
                 → 3 janelas vazias seguidas ⇒ para
```

O `TimelineList` mantém os dois layouts do original: coluna vertical no mobile/tablet e
colunas com scroll horizontal (`snap-x`) no desktop, cada um com seu próprio sentinel.

---

## 6. Testes (Vitest + Testing Library)

| Arquivo | Cobre |
|---|---|
| `date-window.test.ts` | limites das janelas 0, 1, 2; fronteiras de início/fim de dia |
| `group-events-by-day.test.ts` | agrupamento; evento às 23:30 fica no dia certo em `America/Sao_Paulo`; ordem decrescente |
| `EventCard.test.tsx` | título, horário, duração, tags; detalhes expandem/recolhem; evento sem `finishedAt` mostra estado "em andamento" |
| `TimelineList.test.tsx` | renderiza os eventos iniciais; ao carregar janela vazia 3× para de buscar (fetch mockado) |
| `[userId]/page.test.tsx` | renderiza a lista a partir do usecase mockado |

O `src/app/page.test.tsx` atual (Hello World) continua válido — a rota `/` não é tocada.

---

## 7. Ordem de execução

1. Ler `node_modules/next/dist/docs/` — o `AGENTS.md` avisa que esta versão do Next tem
   breaking changes (em especial: `params` em rotas dinâmicas é assíncrono).
2. Instalar dependências + `postcss.config.mjs` + tokens no `globals.css`.
3. `src/lib/utils.ts` e os helpers de `src/lib/timeline/` **com seus testes**.
4. `event-visuals.ts` → `EventCard` → `DayColumn` → `DaySkeleton`.
5. `TimelineList.tsx` (client) com o infinite scroll.
6. `src/app/[userId]/page.tsx` (server) com SSR da janela 0.
7. Rodar `npm test` e `npm run build`; validar `/{userId}` no `next dev`.

---

## 8. Riscos e pontos de atenção

- **Next 16**: convenções podem divergir do treinamento — os docs locais são a fonte da verdade.
  `params` provavelmente é `Promise<{ userId: string }>` e precisa de `await`.
- **Tailwind v4 no Next**: usa `@tailwindcss/postcss` (não o plugin do Vite que o my-daily-flow usa).
- **`globals.css` atual** tem regras (`main { max-width: 48rem }`) que conflitam com o layout
  de 1400px do design — serão substituídas.
- **Sem eventos**: a página precisa de um estado vazio explícito, não uma tela em branco.
- **`userId` inexistente**: a API devolve `200` com `[]`, não `404`. A página mostra o estado vazio.
- **Fuso**: `America/Sao_Paulo` fixo nesta etapa. Se depois a timeline precisar respeitar o fuso do
  visitante, o agrupamento vira client-side puro.
