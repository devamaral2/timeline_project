import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * O que ja saiu do servico de auth e nao pode voltar sem alguem notar.
 *
 * As duas listas sao a unica coisa que um commit de delecao toca: ele apaga o
 * modulo e, no mesmo commit, acrescenta aqui o marcador ou a subarvore que
 * acabou de sumir. Nunca antes -- um marcador de algo que ainda existe deixa a
 * suite vermelha durante toda a remocao e mata o sinal.
 *
 * `src/rbac` nunca entra em `FORBIDDEN_SUBTREES`: RBAC fica e sera expandido.
 */
export const FORBIDDEN_MARKERS: readonly string[] = [
  // Corte do estagio 1.
  "mfaEnabled",
  "mfa_enabled",
  "tokenVersion",
  "token_version",
  "access_grants",
  "oauth_states",
  "cookie-parser",
  // Corte do servico centralizado (RAF-71): MFA, step-up, recovery codes,
  // pwned passwords, SMTP/Twilio e o job de retencao.
  "twilio",
  "recovery_code",
  "recoveryCode",
  "mfa_challenge",
  "step_up",
  "stepUp",
  "pwnedpasswords",
  "nodemailer",
  "cleanup-auth-data",
  // Convites deram lugar ao link de signup (RAF-81).
  "pending_invite",
  "inviteLink",
  // Tabelas apagadas pela 0006 (RAF-72).
  "audit_log",
  "authentication_attempts",
  "mfa_challenges",
];

/** Relativas a `apps/auth`. */
export const FORBIDDEN_SUBTREES: readonly string[] = [
  "src/oauth",
  "src/mfa",
  "src/audit",
  "src/cleanup",
  "src/invites",
];

export interface ScopeViolation {
  kind: "marker" | "subtree";
  path: string;
  marker?: string;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

/** Marcadores sao comparados sem caixa: `Twilio` e `twilio` sao o mesmo conceito. */
export function findScopeViolations(
  root: string,
  lists: { markers: readonly string[]; subtrees: readonly string[] },
): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  const productionFiles = sourceFiles(resolve(root, "src")).filter(
    (file) => !file.endsWith(".test.ts") && !file.endsWith(".spec.ts"),
  );
  for (const file of productionFiles) {
    const contents = readFileSync(file, "utf8").toLowerCase();
    for (const marker of lists.markers) {
      if (contents.includes(marker.toLowerCase())) violations.push({ kind: "marker", path: relative(root, file), marker });
    }
  }
  for (const subtree of lists.subtrees) {
    if (existsSync(resolve(root, subtree))) violations.push({ kind: "subtree", path: subtree });
  }
  return violations;
}

function describeViolation(violation: ScopeViolation): string {
  return violation.kind === "marker"
    ? `forbidden marker "${violation.marker}" in ${violation.path}`
    : `forbidden subtree ${violation.path} still exists`;
}

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("auth scope boundary", () => {
  it("keeps every removed concept out of production source", () => {
    const violations = findScopeViolations(resolve(process.cwd(), "apps/auth"), {
      markers: FORBIDDEN_MARKERS,
      subtrees: FORBIDDEN_SUBTREES,
    });
    expect(violations.map(describeViolation)).toEqual([]);
  });

  it("names the offending file and marker, ignores tests, and flags a surviving subtree", () => {
    const root = mkdtempSync(join(tmpdir(), "auth-scope-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "src", "legacy"), { recursive: true });
    writeFileSync(join(root, "src", "legacy", "gateway.ts"), "export const provider = 'Bogus-Marker';\n");
    writeFileSync(join(root, "src", "legacy", "gateway.test.ts"), "const allowed = 'bogus-marker';\n");

    const violations = findScopeViolations(root, { markers: ["bogus-marker"], subtrees: ["src/legacy", "src/gone"] });

    expect(violations.map(describeViolation)).toEqual([
      `forbidden marker "bogus-marker" in ${join("src", "legacy", "gateway.ts")}`,
      "forbidden subtree src/legacy still exists",
    ]);
  });
});
