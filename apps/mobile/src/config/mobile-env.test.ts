import { expect, test } from "vitest";
import { parseMobileEnv } from "./mobile-env";

const firebase = {
  apiKey: "key",
  authDomain: "project.firebaseapp.com",
  projectId: "project",
  storageBucket: "project.appspot.com",
  messagingSenderId: "1",
  appId: "1:1:web:1",
};

const extra = {
  apiBaseUrl: "http://192.168.0.10:3001",
  googleWebClientId: "1-abc.apps.googleusercontent.com",
  firebase,
};

test("accepts the extra that app.config.ts builds from the root .env", () => {
  expect(parseMobileEnv(extra)).toEqual(extra);
});

test("drops a trailing slash so the paths do not end up with a double one", () => {
  expect(parseMobileEnv({ ...extra, apiBaseUrl: "http://192.168.0.10:3001/" }).apiBaseUrl).toBe(
    "http://192.168.0.10:3001",
  );
});

test("rejects an api url without a scheme, which fetch would not resolve", () => {
  expect(() => parseMobileEnv({ ...extra, apiBaseUrl: "192.168.0.10:3001" })).toThrow(
    /MOBILE_API_URL/,
  );
});

// A falha aparece como tela vermelha no celular, longe do terminal: a mensagem
// precisa dizer o que faltou no .env, e nao so qual campo do schema quebrou.
test("names every missing .env key at once", () => {
  expect(() => parseMobileEnv({})).toThrow(
    /MOBILE_API_URL.*MOBILE_GOOGLE_WEB_CLIENT_ID.*NEXT_PUBLIC_FIREBASE_\*/,
  );
});

test("rejects a firebase config missing any field", () => {
  expect(() =>
    parseMobileEnv({ ...extra, firebase: { ...firebase, appId: "" } }),
  ).toThrow(/NEXT_PUBLIC_FIREBASE_\*/);
});
