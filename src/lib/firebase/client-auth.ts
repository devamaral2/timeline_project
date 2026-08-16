import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from "firebase/auth";
import { getClientApp } from "./client-app";

export function getClientAuth(): Auth {
  return getAuth(getClientApp());
}

export function signInWithGoogle() {
  return signInWithPopup(getClientAuth(), new GoogleAuthProvider());
}

export function signOutClient() {
  return signOut(getClientAuth());
}
