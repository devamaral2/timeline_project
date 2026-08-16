import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

const serverSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export function getClientEnv(
  source: Record<string, string | undefined> = process.env,
): ClientEnv {
  return clientSchema.parse(source);
}

export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverSchema.parse(source);
}
