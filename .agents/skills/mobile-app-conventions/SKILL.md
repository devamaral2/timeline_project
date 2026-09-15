---
name: mobile-app-conventions
description: >
  Convencoes especificas do apps/mobile (Expo 57 + expo-router) — build de
  desenvolvimento nativo, tema sempre escuro, resolucao dos packages @repo/*
  direto do fonte, e a sessao do apps/auth no expo-secure-store. Use ao mexer em
  qualquer coisa dentro de apps/mobile ou ao decidir se uma logica
  compartilhada vai para @repo/timeline ou @repo/theme.
---

## Nao roda no Expo Go

A sessao fica no `expo-secure-store`, um modulo nativo — precisa de
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

## Sessao do apps/auth

`src/lib/auth/session-store.ts` nao importa nada do React Native: e ali que
mora a regra (restaurar do storage, renovar antes do `exp`, renovacao em voo
unico, refresh recusado encerra a sessao, falta de rede nao). `session.ts` so
liga a instancia ao `expo-secure-store` e ao `env`. `token-storage.web.ts`
existe porque o SecureStore nao tem implementacao web — no navegador cai no
`localStorage`, e so serve para depurar telas.

## Metro fica fora do `pnpm dev`

De proposito: ele toma o terminal com a propria interface. Rode
`pnpm dev:mobile` num terminal separado dos outros servicos.
