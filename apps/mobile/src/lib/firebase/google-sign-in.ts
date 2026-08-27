import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { env } from "@/config/env";
import { getClientAuth } from "./app";

let configured = false;

function configure(): void {
  if (configured) return;
  // O webClientId e o do OAuth client web mesmo no Android e no iOS: e ele que
  // identifica o backend para o qual o ID token e emitido, e o Firebase so
  // aceita tokens emitidos para o proprio projeto.
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  configured = true;
}

/** Distingue "o usuario desistiu" de "deu erro" — o primeiro nao vira mensagem. */
export type GoogleSignInResult = "signed-in" | "cancelled";

/**
 * Faz o login nativo do Google e troca o ID token dele por uma sessao do
 * Firebase. O `signInWithPopup` que o web usa nao existe no React Native: nao
 * ha janela para abrir.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (response.type === "cancelled") return "cancelled";

  const { idToken } = response.data;
  if (!idToken) throw new Error("O Google nao devolveu um ID token.");

  await signInWithCredential(getClientAuth(), GoogleAuthProvider.credential(idToken));
  return "signed-in";
}

/**
 * Sai das duas pontas. So deslogar do Firebase deixaria a conta do Google ainda
 * escolhida, e o proximo login entraria direto na mesma conta sem perguntar.
 */
export async function signOutFromGoogle(): Promise<void> {
  configure();
  await signOut(getClientAuth());
  await GoogleSignin.signOut();
}
