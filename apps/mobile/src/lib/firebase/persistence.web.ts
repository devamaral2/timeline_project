import { browserLocalPersistence, type Persistence } from "firebase/auth";

/**
 * A mesma coisa que `persistence.ts`, para o alvo web do Expo — util para
 * depurar as telas no navegador (`npx expo start --web`).
 *
 * O `localStorage` e o equivalente do AsyncStorage aqui: sobrevive ao fechar a
 * aba, que e o que a persistencia nativa faz ao fechar o app.
 */
export const authPersistence: Persistence = browserLocalPersistence;
