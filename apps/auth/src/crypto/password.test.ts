import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("aceita a senha correta", async () => {
    const hash = await hashPassword("uma senha longa o bastante");

    await expect(verifyPassword("uma senha longa o bastante", hash)).resolves.toBe(true);
  });

  it("recusa a senha errada", async () => {
    const hash = await hashPassword("uma senha longa o bastante");

    await expect(verifyPassword("uma senha longa o bastant", hash)).resolves.toBe(false);
  });

  it("gera hashes diferentes para a mesma senha", async () => {
    const [first, second] = await Promise.all([hashPassword("repetida"), hashPassword("repetida")]);

    expect(first).not.toBe(second);
  });

  // Usuario que so entra por OAuth nao tem senha guardada. Verificar contra lixo
  // precisa devolver false, e nao explodir: o login responde igual para "senha
  // errada" e "usuario sem senha".
  it("devolve false para hash malformado em vez de lancar", async () => {
    await expect(verifyPassword("qualquer", "")).resolves.toBe(false);
    await expect(verifyPassword("qualquer", "bcrypt$nao$e$nosso$formato$x")).resolves.toBe(false);
  });

  it("recusa digest codificado enorme antes de decodificar seus bytes", async () => {
    const from = vi.spyOn(Buffer, "from");
    const storedHash = `scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$${"A".repeat(100_000)}`;

    try {
      await expect(verifyPassword("qualquer", storedHash)).resolves.toBe(false);
      expect(from).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
    }
  });

  it("normaliza unicode antes de derivar", async () => {
    const composed = "senha\u00e7";
    const decomposed = "senhac\u0327";
    const hash = await hashPassword(composed);

    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });
});
