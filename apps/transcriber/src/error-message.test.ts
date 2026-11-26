import { expect, it } from "vitest";
import { errorMessage } from "./error-message";

it("usa a mensagem do erro e, para o que não é erro, o próprio valor", () => {
  expect(errorMessage(new Error("deu ruim"))).toBe("deu ruim");
  expect(errorMessage("texto solto")).toBe("texto solto");
  expect(errorMessage(42)).toBe("42");
  expect(errorMessage(undefined)).toBe("undefined");
});
