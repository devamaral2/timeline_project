import { spawn } from "node:child_process";
import { AbortedError } from "../ports";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

/** Roda um programa e espera. Um código de saída diferente de zero rejeita, com o fim do stderr na mensagem. */
export type CommandRunner = (command: string, args: string[], options: { signal: AbortSignal; env?: Record<string, string> }) => Promise<CommandResult>;

const STDERR_TAIL = 2000;

export const runCommand: CommandRunner = (command, args, { signal, env }) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AbortedError());
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));

    const onAbort = () => child.kill("SIGTERM");
    signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (cause) => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error(`não foi possível iniciar '${command}': ${cause.message}`));
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (signal.aborted) return reject(new AbortedError());
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`'${command}' saiu com código ${code}: ${stderr.slice(-STDERR_TAIL).trim() || stdout.slice(-STDERR_TAIL).trim()}`));
    });
  });
