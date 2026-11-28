import { expect, test, vi } from "vitest";
import { AgentFileArtifactsReconciler } from "../../api-core/agent/config/agent-file-artifacts.reconciler";
import { AgentFilesBootstrap } from "./agent-files.bootstrap";

function setup(configuredDir: string | undefined) {
  vi.stubEnv("AGENT_FILES_DIR", configuredDir);
  const calls: string[] = [];
  const files = {
    start: vi.fn(async () => void calls.push("files.start")),
    stop: vi.fn(() => void calls.push("files.stop")),
  };
  const reconciler = { start: vi.fn(async () => void calls.push("reconciler.start")) };
  const router = { sync: vi.fn(async () => void calls.push("router.sync")) };
  const bootstrap = new AgentFilesBootstrap(
    files as unknown as never,
    reconciler as unknown as AgentFileArtifactsReconciler,
    router as unknown as never,
  );
  return { bootstrap, files, reconciler, router, calls };
}

test("sem pasta configurada, só sincroniza os artefatos do router", async () => {
  const { bootstrap, files, reconciler, router, calls } = setup(undefined);

  await bootstrap.start();
  bootstrap.stop();

  // O stop sempre limpa o timer do service; sem pasta ele nunca foi ligado.
  expect(calls).toEqual(["router.sync", "files.stop"]);
  expect(router.sync).toHaveBeenCalledTimes(1);
  expect(files.start).not.toHaveBeenCalled();
  expect(reconciler.start).not.toHaveBeenCalled();
  expect(files.stop).toHaveBeenCalledTimes(1);
  vi.unstubAllEnvs();
});

test("com pasta configurada, sobe a leitura dos arquivos e o reconciliador na ordem, e para os arquivos no shutdown", async () => {
  const { bootstrap, files, reconciler, calls } = setup("/tmp/agent-files");

  await bootstrap.start();
  bootstrap.stop();

  expect(calls).toEqual(["router.sync", "files.start", "reconciler.start", "files.stop"]);
  expect(reconciler.start).toHaveBeenCalledTimes(1);
  expect(files.stop).toHaveBeenCalledTimes(1);
  vi.unstubAllEnvs();
});
