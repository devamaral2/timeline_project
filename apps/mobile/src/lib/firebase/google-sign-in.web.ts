import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getClientAuth } from "./app";

export type GoogleSignInResult = "signed-in" | "cancelled";

function isPopupCancellation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;

  return (
    error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request"
  );
}

/** Usa o Firebase Web quando o Expo serve o app no navegador. */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    await signInWithPopup(
      getClientAuth(),
      new GoogleAuthProvider(),
      browserPopupRedirectResolver,
    );
    return "signed-in";
  } catch (error) {
    if (isPopupCancellation(error)) return "cancelled";
    throw error;
  }
}

export async function signOutFromGoogle(): Promise<void> {
  await signOut(getClientAuth());
}
