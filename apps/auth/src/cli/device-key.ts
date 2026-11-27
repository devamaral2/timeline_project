const USAGE = "usage: device-key issue --email EMAIL [--label LABEL] | device-key revoke --id KEY_ID";

export type DeviceKeyCommand =
  | { command: "issue"; email: string; label: string }
  | { command: "revoke"; keyId: string };

function options(values: string[], allowed: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < values.length; i += 2) {
    const name = values[i];
    const value = values[i + 1];
    if (!name || !allowed.includes(name) || !value || name in result) throw new Error(USAGE);
    result[name] = value;
  }
  return result;
}

export function parseDeviceKeyArgs(argv: string[]): DeviceKeyCommand {
  const [command, ...rest] = argv;
  if (command === "issue") {
    const given = options(rest, ["--email", "--label"]);
    if (!given["--email"]) throw new Error(USAGE);
    return { command, email: given["--email"], label: given["--label"] ?? "transcription-service" };
  }
  if (command === "revoke") {
    const given = options(rest, ["--id"]);
    if (!given["--id"]) throw new Error(USAGE);
    return { command, keyId: given["--id"] };
  }
  throw new Error(USAGE);
}
