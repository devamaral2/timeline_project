# Time Composure

Monorepo Turborepo + pnpm workspace.

```
apps/web              Next.js 16 — frontend web (porta 3000)
apps/mobile           Expo 57 + expo-router — app nativo
apps/api              NestJS — backend (porta 3001, so loopback por padrao)
packages/entities     @repo/entities — dominio, portas e DTOs
packages/persistence  @repo/persistence — DAOs, repositories e Firestore admin
packages/timeline     @repo/timeline — datas, janelas e agrupamento da timeline
packages/theme        @repo/theme — os tokens de cor do design system
```

O backend nao e exposto para fora do servidor: web e back rodam na mesma
maquina, e o Next repassa `/api/*` para o Nest via `rewrites`. Nenhum dos dois
frontends tem regra de negocio — do backend eles importam apenas tipos
(`@repo/entities/contracts`).

Web e mobile compartilham a logica de datas (`@repo/timeline`) e a paleta
(`@repo/theme`), para que as duas telas mostrem os mesmos dias nas mesmas cores.

## Desenvolvimento

Requer Node 24+ e `pnpm` no PATH:

```bash
corepack enable pnpm
```

(num terminal com privilegio de administrador no Windows; alternativamente
`npm i -g pnpm`.)

Depois:

```bash
pnpm install
```

Copie `.env.example` para `.env` e preencha os valores. Um unico arquivo na raiz
serve os tres apps; `.env.local` sobrescreve `.env`. As variaveis do Firebase
Admin (`FIREBASE_*`) e do OpenRouter sao do backend; as `NEXT_PUBLIC_FIREBASE_*`
sao dos frontends. Sem as credenciais admin explicitas, cai em
`applicationDefault()`.

```bash
pnpm turbo run dev
```

Sobe o Nest em `http://127.0.0.1:3001` e o Next em `http://localhost:3000`.

## App mobile

O app nao roda no Expo Go: o login usa o Google Sign-In nativo, que exige um
development build.

1. No Firebase Console, pegue o **Web client ID** do provedor Google
   (Authentication > Sign-in method > Google) e ponha em
   `MOBILE_GOOGLE_WEB_CLIENT_ID`. No Android, cadastre tambem a impressao
   digital SHA-1 da chave de debug em Project settings > Your apps.
2. Descubra o IP da sua maquina na rede local (`ipconfig` no Windows) e ponha
   `MOBILE_API_URL=http://<ip>:3001` no `.env`.
3. `API_HOST=0.0.0.0` no `.env`, para o Nest atender na rede em vez de so no
   loopback. Isso e para desenvolvimento: em producao a variavel fica de fora e
   o bind volta a `127.0.0.1`.

```bash
pnpm --filter @repo/mobile run android   # gera o projeto nativo e instala no aparelho
pnpm --filter @repo/mobile run start     # Metro, nas vezes seguintes
```

Os icones e a splash ainda sao os do template do Expo
(`apps/mobile/assets/`) — troque quando tiver a arte do app.

## Testes

```bash
npm run --silent test:ai
```

Roda a suite inteira dos sete workspaces numa unica execucao do Vitest, com
saida minima: `Tests pass` quando verde. Use `npm test` para a saida completa, ou
`npx vitest run --project api` para um workspace so.

## Build e tipos

```bash
pnpm turbo run build
pnpm turbo run typecheck
```

Os packages compilam antes dos apps (`dependsOn: ["^build"]`). O mobile fica de
fora do `build`: o bundle dele sai do Metro (`expo export`) ou do EAS Build, nao
do `tsc`.
