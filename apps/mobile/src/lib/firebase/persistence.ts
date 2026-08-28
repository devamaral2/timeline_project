import AsyncStorage from "@react-native-async-storage/async-storage";
import { getReactNativePersistence, type Persistence } from "firebase/auth";

/**
 * Onde a sessao do Firebase e guardada no aparelho.
 *
 * Sem uma persistencia explicita o SDK cai em memoria no React Native, e o
 * usuario e deslogado toda vez que o app fecha.
 *
 * Ha um irmao `persistence.web.ts` para o alvo web do Expo: o build web do
 * `@firebase/auth` nao exporta `getReactNativePersistence`, e chamar essa
 * funcao la derruba o app antes da primeira tela. O Metro escolhe o arquivo
 * pela plataforma; ninguem precisa perguntar em qual delas esta rodando.
 */
export const authPersistence: Persistence = getReactNativePersistence(AsyncStorage);
