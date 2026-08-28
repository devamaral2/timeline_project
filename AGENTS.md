# Estrutura do monorepo

Turborepo + pnpm workspace. Sete workspaces:

```
apps/web          Next.js 16 — frontend web, sem regra de negocio
apps/mobile       Expo 57 + expo-router — app nativo, sem regra de negocio
apps/api          NestJS — usecases, services, gateways, controllers HTTP
packages/entities @repo/entities — dominio, portas e DTOs
packages/persistence @repo/persistence — DAOs, repositories e Firestore admin
packages/timeline @repo/timeline — datas, janelas e agrupamento da timeline
packages/theme    @repo/theme — os tokens de cor do design system
```

Direcao das dependencias (nunca o contrario):

```
apps/web    ──> @repo/entities/contracts (apenas `import type`), @repo/timeline, @repo/theme
apps/mobile ──> @repo/entities/contracts (apenas `import type`), @repo/timeline, @repo/theme
apps/api    ──> @repo/entities, @repo/entities/ports, @repo/persistence
@repo/persistence ──> @repo/entities
@repo/timeline    ──> @repo/entities/contracts (apenas `import type`)
```

Os packages nao conhecem os apps. As portas de repositorio (`EventRepository`,
`TagRepository`) vivem em `@repo/entities/ports` justamente para que
`@repo/persistence` possa implementa-las sem depender de `apps/api`.

`@repo/timeline` e `@repo/theme` existem para que web e mobile calculem as
mesmas janelas de data e pintem as mesmas cores. Regra pratica: se web e mobile
precisarem da mesma logica e ela nao depender do DOM nem do React Native, ela
vai para um desses dois — nao para os dois apps.

## Front e back

O backend escuta so em `127.0.0.1` por padrao — nao e exposto para fora do
servidor. O browser fala com o Next, que repassa `/api/*` ao Nest pelo
`rewrites` do `apps/web/next.config.ts`. Chamadas server-side (Server
Components) usam `fetchFromBackend` em `apps/web/src/lib/api/backend.ts`.

O app mobile nao tem esse rewrite: ele fala direto com o Nest, pelo host em
`MOBILE_API_URL`. Veja "App mobile" abaixo.

Nao coloque regra de negocio em `apps/web` nem em `apps/mobile`. Do backend eles
so importam tipos.

**Ordem das rotas no Nest importa**: em `apps/api/src/events/http/events.controller.ts`
as rotas estaticas (`daily`, `ai`, `voice`) precisam ser declaradas antes de
`:eventId`, senao o parametro dinamico captura as tres. Ha um teste travando isso
(`events.routing.test.ts`).

# A marca de nao realizado

Nao ha status. O evento nao tem ciclo de vida, nao tem situacao derivada do
relogio e nao tem o par realizado/nao realizado: tem **uma anotacao**, em
`packages/entities/src/events/types/missed-flag.ts`.

- `missed` — booleano, padrao `false`. E o usuario registrando o que perdeu.
- `priority` — `urgent`, `normal`, `flexible`, em `event-priority.ts`. Campo
  separado, que nao conversa com a marca.

**A marca nao tem oposto.** Um evento sem ela nao e "realizado" — e um evento
que ninguem anotou, que e o normal. Por isso o selo do cartao so aparece quando
`missed` e true (`MissedBadge`, nos dois apps): desenhar "Realizado" em tudo que
sobrou seria afirmar uma coisa que ninguem afirmou. Marcar e desmarcar sao a
mesma acao nos dois sentidos, e o formulario de edicao usa uma caixa, nao uma
lista.

**Nada liga a marca sozinho.** Nenhuma hora, nenhuma janela fechada, nenhum
evento antigo. A timeline nao consulta relogio nenhum para monta-la — foi por
isso que o `ListTimelineEventsUseCase` perdeu o clock que recebia.

**Nao ha migracao dos documentos antigos**, e o Firestore nao valida nada. Quem
cobre a lacuna e a leitura, em `readMissedFlag`: documento sem os campos fica
sem marca, e o `status` da versao anterior — que continua gravado por ai — so
vira marca quando era exatamente `missed`. Os outros valores daquele ciclo de
vida (`draft`, `scheduled`, `in_progress`, `completed`, `archived`) falavam de
planejamento, nao de o usuario ter faltado, e traduzi-los seria inventar
anotacoes que ninguem fez. O `MissedBadge` tambem aceita `undefined` sem
quebrar: um backend de outra versao nao pode derrubar a timeline. O caminho de
escrita e o contrario, e mais estrito — o controller recusa com 400 qualquer
`missed` que nao seja booleano e qualquer prioridade fora das tres.

Os rotulos em portugues vivem nos `event-visuals` de cada app, junto dos rotulos
de tipo. O selo usa `destructive`, que e token de situacao e vive separado de
`training` e `food`, que sao tokens de tipo: os dois aparecem no mesmo cartao e
precisam ser distinguiveis.

# App mobile

Expo SDK 57 com expo-router, roteamento por arquivo em `apps/mobile/src/app`.

**Precisa de development build, nao roda no Expo Go**: o login usa o Google
Sign-In nativo (`@react-native-google-signin/google-signin`), que e um modulo
nativo. `pnpm --filter @repo/mobile run android` gera o projeto nativo e instala.

**O celular nao alcanca o loopback da sua maquina.** Para desenvolver com o app
num aparelho de verdade:

1. `API_HOST=0.0.0.0` no `.env` — o Nest passa a escutar na rede local e liga o
   CORS (`apps/api/src/main.ts`). Sem isso o `.env` fica como esta e o bind
   continua em `127.0.0.1`, que e o comportamento de producao.
2. `MOBILE_API_URL=http://<ip-da-sua-maquina>:3001` no `.env`.

**Estilo**: `StyleSheet` do React Native, com as cores vindo de `@repo/theme`.
O app abre sempre no tema escuro — a identidade visual foi desenhada assim, e
`use-theme.ts` devolve `darkTheme` fixo em vez de seguir o `useColorScheme` do
sistema (o web faz o equivalente com a classe `dark` fixa no `<html>`). O tema
claro continua no pacote, esperando uma opcao explicita de troca.
O RN nao entende oklch nem `var()`, entao o pacote converte os tokens do
`globals.css` para hex/rgba. As duas paletas sao travadas juntas por
`apps/web/src/styles/theme-tokens.test.ts` — mudar uma cor no CSS sem mudar em
`@repo/theme` quebra esse teste.

**Resolucao dos packages**: `@repo/theme`, `@repo/timeline` e `@repo/entities`
declaram uma condicao de exportacao `react-native` que aponta para `src/*.ts`.
O Metro le o TypeScript direto do fonte, entao editar um package aparece no app
sem `build`. Web e API continuam consumindo `dist/`.

**Firebase**: `apps/mobile/src/types/firebase-auth.d.ts` declara
`getReactNativePersistence`, que existe no build React Native do
`@firebase/auth` mas nao nos tipos que o TypeScript resolve. Sem essa
persistencia o usuario e deslogado toda vez que o app fecha.

# Variaveis de ambiente

Um unico `.env` na raiz serve os tres apps. O Nest carrega via
`apps/api/src/config/load-env.ts`; o Next carrega no topo do `next.config.ts`; o
Expo carrega no `apps/mobile/app.config.ts`, que repassa os valores ao app pelo
campo `extra` (lido em `apps/mobile/src/config/env.ts`).

`.env.local` tem precedencia sobre `.env`.

O mobile reusa as chaves `NEXT_PUBLIC_FIREBASE_*` do web: e o mesmo projeto e o
mesmo app client. Tudo que entra em `extra` vai embutido no bundle — nao
coloque la nada que ja nao seja publico.

# Comandos

`pnpm` precisa estar no PATH (`corepack enable pnpm` num terminal admin, ou
`npm i -g pnpm`) — o Turborepo invoca o gerenciador de pacotes diretamente.

```
pnpm install              instala tudo
pnpm turbo run build      builda na ordem de dependencia
pnpm turbo run typecheck  checa tipos nos 7 workspaces
pnpm turbo run dev        sobe Nest (3001) e Next (3000)

pnpm --filter @repo/mobile run start     sobe o Metro
pnpm --filter @repo/mobile run android   gera o projeto nativo e instala no aparelho
```

O Metro fica fora do `turbo run dev` de proposito: ele toma o terminal com a
propria interface, e o fluxo normal e ter os dois rodando em terminais
separados.

**`dev` depende de `^build`** (`turbo.json`). O Nest e o Next leem os packages
de `dist/`, nao do fonte — so o Metro le TypeScript direto. Sem essa
dependencia, um simbolo recem-criado em `@repo/entities` existiria apenas no
`src`: o `nest start --watch` nao compilaria, a API nunca subiria na 3001, e a
pagina do Next responderia 500 no `fetchFromBackend` — um erro que parece do
backend, mas e de build. Se a API estiver fora do ar, `pnpm turbo run build`
antes de subir o dev resolve.

# Rodando os testes

Use **sempre** `npm run --silent test:ai`, nunca `npm test` nem `npx vitest`.
(`--silent` corta o cabecalho que o proprio npm imprime.)

Ele roda a suite inteira — os sete workspaces — em uma unica execucao do
Vitest, com `vitest.quiet.config.ts`, que herda tudo de `vitest.config.ts` e so
troca a saida (reporter em `test/quiet-reporter.ts`):

- **Passou** — imprime exatamente `Tests pass` e sai com codigo 0.
- **Falhou** — imprime o primeiro teste quebrado (arquivo, cadeia
  `describe > teste`, erro, `expected`/`actual` e a stack de chamadas) e o total
  `N of M tests failed`. Sai com codigo 1. A stack mostra so os frames do
  projeto: os frames de `@vitest/runner` e `node:internal` sao identicos em todo
  erro e nao ajudam.

Nada mais e impresso: sem cabecalho, sem lista de arquivos, sem os `console.log`
dos testes. O objetivo e cortar o consumo de tokens ao rodar testes.

Os projetos do Vitest ficam em `vitest.workspace.ts`. Ele resolve `@repo/*`
direto do fonte TypeScript, e nao de `dist/` — por isso `test:ai` nao precisa de
build antes, e a saida continua sendo so a do Vitest.

O projeto `mobile` roda em ambiente node e inclui so `*.test.ts`, sem `.tsx`:
renderizar componente de React Native exigiria o runtime nativo, que nao existe
no Vitest. O que da para testar la e logica pura.

Cuidado ao logar em codigo de producao rodado por teste: o `Logger` do Nest
escreve direto no stdout e escapa do `silent` do Vitest. Por isso o
`DomainExceptionFilter` recebe o logger pelo construtor, e os testes passam um
mudo (`apps/api/src/events/testing/status-of.ts`).

Para investigar uma falha alem do primeiro erro, rode `npm test` (saida completa
do Vitest) ou filtre um arquivo:
`npm run --silent test:ai apps/api/src/caminho/do.test.ts`.
Para rodar so um workspace: `npx vitest run --project api`
(`web`, `mobile`, `api`, `entities`, `persistence`, `timeline`, `theme`).
