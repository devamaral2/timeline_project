import { describe, expect, test } from "vitest";
import { documentedOperations } from "../../common/openapi-operations";
import { API_HTTP_OPERATIONS, API_PUBLIC_PATHS, operationKey } from "./api-http-operations";

describe("matriz HTTP da API", () => {
  test("inventaria exatamente as operações do catálogo, com status de sucesso e formato de resposta", () => {
    const keys = API_HTTP_OPERATIONS.map(operationKey).sort();

    expect(keys).toEqual(Object.keys(documentedOperations).sort());
    expect(new Set(keys).size).toBe(keys.length);

    for (const operation of API_HTTP_OPERATIONS) {
      const doc = documentedOperations[operationKey(operation)];
      expect(operation.successStatuses, operationKey(operation)).toContain(doc.success.status);
      // Só o 204 responde sem corpo. A reserva aceita 200 com JSON ou 204 vazio.
      const onlyNoContent = operation.successStatuses.length === 1 && operation.successStatuses[0] === 204;
      expect(operation.responseFormat === "empty", operationKey(operation)).toBe(onlyNoContent);
      if (operation.successStatuses.includes(204) && operation.successStatuses.length > 1) {
        expect(operation.responseFormat, operationKey(operation)).toBe("json-or-empty");
      }
    }
  });

  test("as operações do serviço local exigem a chave de dispositivo; as demais, a sessão do gateway", () => {
    const device = API_HTTP_OPERATIONS.filter((operation) => operation.authentication === "transcription-device-key");

    expect(device.map(operationKey)).toEqual([
      "POST /api/transcription-worker/next",
      "POST /api/transcription-worker/lease",
      "POST /api/transcription-worker/deliver",
    ]);
    expect(API_HTTP_OPERATIONS.filter((operation) => operation.authentication === "gateway-session")).toHaveLength(37);
  });

  test("a documentação é pública e não entra na autenticação das operações", () => {
    expect(API_PUBLIC_PATHS.map((path) => `${path.method} ${path.path}`)).toEqual(["GET /openapi.json", "GET /docs"]);
    expect(API_HTTP_OPERATIONS.map(operationKey)).not.toContain("GET /openapi.json");
    expect(API_HTTP_OPERATIONS.map(operationKey)).not.toContain("GET /docs");
  });
});
