import Constants from "expo-constants";
import { parseMobileEnv, type MobileEnv } from "./mobile-env";

/**
 * A config resolvida em tempo de build pelo `app.config.ts` e embutida no
 * bundle. Ler no topo do modulo faz a falha aparecer no primeiro import, e nao
 * no meio de uma tela.
 */
export const env: MobileEnv = parseMobileEnv(Constants.expoConfig?.extra);
