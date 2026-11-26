import { describe, expect, it } from "vitest";
import { parseDeviceKeyArgs } from "./device-key";

describe("parseDeviceKeyArgs", () => {
  it("parses issue with an email and an optional label", () => {
    expect(parseDeviceKeyArgs(["issue", "--email", "a@b.c", "--label", "pc de casa"])).toEqual({ command: "issue", email: "a@b.c", label: "pc de casa" });
    expect(parseDeviceKeyArgs(["issue", "--email", "a@b.c"])).toEqual({ command: "issue", email: "a@b.c", label: "transcription-service" });
  });

  it("parses revoke with a key id", () => {
    expect(parseDeviceKeyArgs(["revoke", "--id", "01ABC"])).toEqual({ command: "revoke", keyId: "01ABC" });
  });

  it.each([[[]], [["issue"]], [["revoke"]], [["issue", "--email"]], [["issue", "--id", "x"]], [["other", "--email", "a"]]])(
    "rejects %j with the usage",
    (argv) => {
      expect(() => parseDeviceKeyArgs(argv)).toThrow("usage: device-key");
    },
  );
});
