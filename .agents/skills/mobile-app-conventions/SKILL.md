---
name: mobile-app-conventions
description: >
  Convencoes especificas do apps/mobile (Expo 57 + expo-router) — build de
  desenvolvimento nativo, tema sempre escuro, resolucao dos packages @repo/*
  direto do fonte, e a persistencia de sessao do Firebase. Use ao mexer em
  qualquer coisa dentro de apps/mobile ou ao decidir se uma logica
  compartilhada vai para @repo/timeline ou @repo/theme.
---

## Nao roda no Expo Go

O login usa Google Sign-In nativo
(`@react-native-google-signin/google-signin`), um modulo nativo — precisa de
development build. `pnpm --filter @repo/mobile run android` gera o projeto
nativo e instala no aparelho. Para testar num aparelho fisico (que nao
alcanca o loopback da sua maquina), veja a skill `env-setup`.

## Tema sempre escuro

`StyleSheet` do React Native, cores vindas de `@repo/theme`. O app abre
sempre no tema escuro por decisao de design — `use-theme.ts` devolve
`darkTheme` fixo em vez de seguir o `useColorScheme` do sistema (o web faz o
equivalente com a classe `dark` fixa no `<html>`). O tema claro continua no
pacote, esperando uma opcao explicita de troca.

O RN nao entende `oklch` nem `var()`, entao `@repo/theme` converte os tokens
de `globals.css` para hex/rgba. As duas paletas sao travadas juntas por
`apps/web/src/styles/theme-tokens.test.ts` — mudar uma cor no CSS sem mudar
em `@repo/theme` quebra esse teste.

## Packages resolvidos do fonte, nao de dist/

`@repo/theme`, `@repo/timeline` e `@repo/entities` declaram uma condicao de
exportacao `react-native` que aponta para `src/*.ts`. O Metro le o TypeScript
direto — editar um package aparece no app sem `build`. Web e API continuam
consumindo `dist/`, entao um typecheck so nesses dois nao pega uma quebra que
so o Metro veria.

## Firebase

`apps/mobile/src/types/firebase-auth.d.ts` declara
`getReactNativePersistence`, que existe no build React Native do
`@firebase/auth` mas nao nos tipos que o TypeScript resolve por padrao. Sem
essa persistencia o usuario e deslogado toda vez que o app fecha.

## Metro fica fora do `pnpm dev`

De proposito: ele toma o terminal com a propria interface. Rode
`pnpm dev:mobile` num terminal separado dos outros servicos.
