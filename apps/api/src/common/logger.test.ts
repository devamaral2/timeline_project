import { expect, test, vi } from "vitest";
import { Logger } from "./logger";

test("escreve cada nivel no canal que o Nest usava: log no stdout, aviso e erro no stderr", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    const logger = new Logger("Pedidos");
    logger.log("comecou");
    logger.warn("quase");
    logger.error("falhou", "stack");

    expect(log).toHaveBeenCalledWith("[Pedidos] comecou");
    expect(warn).toHaveBeenCalledWith("[Pedidos] quase");
    expect(error).toHaveBeenCalledWith("[Pedidos] falhou", "stack");
  } finally {
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  }
});

test("sem contexto, a mensagem sai sem prefixo", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    new Logger().log("oi");
    expect(log).toHaveBeenCalledWith("oi");
  } finally {
    log.mockRestore();
  }
});
