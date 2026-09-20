declare module "vitest" {
  export interface ProvidedContext {
    apiPostgresUrl: string;
    authPostgresUrl: string;
  }
}

export {};
