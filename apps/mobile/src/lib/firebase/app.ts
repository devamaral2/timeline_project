import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth, type Auth } from "firebase/auth";
import { env } from "@/config/env";

export function getClientApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(env.firebase);
}

let auth: Auth | undefined;

/**
 * `initializeAuth` no lugar de `getAuth` porque no React Native o SDK nao tem
 * onde guardar a sessao: sem passar uma persistencia explicita ele cai em
 * memoria e o usuario e deslogado a cada vez que o app e fechado.
 *
 * So pode ser chamado uma vez por app — dai o cache no modulo.
 */
export function getClientAuth(): Auth {
  auth ??= initializeAuth(getClientApp(), {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  return auth;
}
