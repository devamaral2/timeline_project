import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { Client } from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const root = resolve(__dirname, "../..");
const exec = promisify(execFile);

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cannot reserve E2E port");
  await new Promise<void>((ok) => server.close(() => ok()));
  return address.port;
}

async function command(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await exec("pnpm", args, { cwd: root, env, maxBuffer: 4_000_000 });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`${args.join(" ")} failed\n${failure.stdout ?? ""}\n${failure.stderr ?? failure.message}`);
  }
}

function start(args: string[], env: NodeJS.ProcessEnv): { child: ChildProcess; logs: () => string } {
  const child = spawn(args[0], args.slice(1), { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-12_000); });
  }
  return { child, logs: () => output };
}

async function ready(url: string, process: { child: ChildProcess; logs: () => string }): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (process.child.exitCode !== null) throw new Error(`E2E service exited: ${process.logs()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) return;
    } catch { /* service is not listening yet */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(`E2E service did not become ready: ${url}\n${process.logs()}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((ok) => child.once("exit", () => ok())),
    new Promise<void>((ok) => setTimeout(ok, 5000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const nextBuildId = randomUUID().replaceAll("-", "");
  const nextBuildPath = resolve(root, `apps/web/.next-e2e-${nextBuildId}`);
  const processes: ChildProcess[] = [];
  async function cleanup(): Promise<void> {
    await Promise.all(processes.reverse().map(stop));
    await rm(nextBuildPath, { recursive: true, force: true });
    await container.stop();
  }

  try {
    const authDatabaseUrl = container.getConnectionUri();
    const databaseName = `e2e_api_${randomUUID().replaceAll("-", "")}`;
    const admin = new Client({ connectionString: authDatabaseUrl });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE "${databaseName}"`); }
    finally { await admin.end(); }
    const apiDatabase = new URL(authDatabaseUrl);
    apiDatabase.pathname = `/${databaseName}`;
    const apiDatabaseUrl = apiDatabase.toString();

    const [apiPort, authPort, webPort, transcriptionPort] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const authUrl = `http://127.0.0.1:${authPort}`;
    const webUrl = `http://127.0.0.1:${webPort}`;
    const sharedKey = randomBytes(32).toString("base64url");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: apiDatabaseUrl,
      AUTH_DATABASE_URL: authDatabaseUrl,
      AUTH_DATABASE_MIGRATION_URL: authDatabaseUrl,
      AUTH_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      AUTH_INTERNAL_SERVICE_KEY: sharedKey,
      AUTH_ISSUER: authUrl,
      AUTH_PUBLIC_URL: authUrl,
      AUTH_WEB_APP_URL: webUrl,
      API_SERVICE_URL: apiUrl,
      BACKEND_URL: authUrl,
      AUTH_SERVICE_URL: authUrl,
      API_HOST: "127.0.0.1",
      API_PORT: String(apiPort),
      AUTH_HOST: "127.0.0.1",
      AUTH_PORT: String(authPort),
      OPENROUTER_API_KEY: "e2e-mocked-key",
      OPENROUTER_AGENT_MODEL: "e2e-mocked-model",
      AUDIO_TRANSCRIPTION_ENABLED: "true",
      AUDIO_TRANSCRIPTION_URL: `http://127.0.0.1:${transcriptionPort}`,
      AUDIO_TRANSCRIPTION_KEY: randomBytes(32).toString("base64url"),
      TRANSCRIPTION_PORT: String(transcriptionPort),
      PYTHONPATH: resolve(root, "services/transcription"),
      WEB_PORT: String(webPort),
      E2E_NEXT_BUILD_ID: nextBuildId,
    };

    await command(["turbo", "run", "build", "--filter=@repo/api", "--filter=@repo/auth", "--filter=@repo/timeline", "--filter=@repo/theme"], env);
    await Promise.all([
      command(["--filter", "@repo/api", "run", "db:migrate"], env),
      command(["--filter", "@repo/auth", "run", "db:migrate"], env),
    ]);

    const preload = resolve(__dirname, "external-mocks.mjs");
    const transcription = start([process.env.E2E_TRANSCRIPTION_PYTHON ?? "python3", resolve(__dirname, "transcription-service.py")], env);
    processes.push(transcription.child);
    await ready(`${env.AUDIO_TRANSCRIPTION_URL}/health`, transcription);
    const api = start([process.execPath, "--import", preload, resolve(root, "apps/api/dist/main.js")], env);
    processes.push(api.child);
    await ready(`${apiUrl}/api/events`, api);
    const auth = start([process.execPath, "--import", preload, resolve(root, "apps/auth/dist/main.js")], env);
    processes.push(auth.child);
    await ready(`${authUrl}/health/ready`, auth);
    const web = start(["pnpm", "--filter", "@repo/web", "run", "dev"], { ...env, NODE_ENV: "development" });
    processes.push(web.child);
    await ready(webUrl, web);

    // Playwright forwards these generated values to workers. No user-supplied test DB URL is needed.
    process.env.E2E_AUTH_DATABASE_URL = authDatabaseUrl;
    process.env.E2E_WEB_URL = webUrl;
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
