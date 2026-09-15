export type PasswordPolicyCode =
  | "password_length"
  | "password_control"
  | "password_context"
  | "password_uppercase"
  | "password_digit"
  | "password_symbol";
export type PasswordPolicyResult = { accepted: true; passwordNfc: string } | { accepted: false; code: PasswordPolicyCode };

const CONTROL_OR_LONE_SURROGATE = /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/;

/**
 * `normalizedEmail` e `name` sao os valores que a pessoa esta **enviando**, nunca
 * os da linha guardada: no signup a linha e um placeholder (`admin_<hash>`, sem
 * email), e avaliar contra ela deixaria alguem usar o proprio email como senha.
 *
 * As tres regras de classe de caractere foram pedidas pelo produto (TDD §7). O
 * que de fato segura senha fraca continua sendo o tamanho e a lista de contexto.
 */
export function evaluatePassword(input: { password: string; normalizedEmail: string; name: string }): PasswordPolicyResult {
  const passwordNfc = input.password.normalize("NFC");
  const length = [...passwordNfc].length;
  if (length < 12 || length > 128) return { accepted: false, code: "password_length" };
  if (CONTROL_OR_LONE_SURROGATE.test(passwordNfc)) return { accepted: false, code: "password_control" };

  const folded = passwordNfc.normalize("NFKC").toLowerCase();
  const email = input.normalizedEmail.normalize("NFKC").toLowerCase();
  const local = email.split("@")[0] ?? "";
  const name = input.name.normalize("NFKC").toLowerCase();
  const context = ["timeline", "timeline_project", "braid", email, local, name, ...name.split(/[^\p{L}\p{N}]+/u).filter((part) => [...part].length >= 3)].filter(Boolean);
  if (context.includes(folded)) return { accepted: false, code: "password_context" };

  if (!/\p{Lu}/u.test(passwordNfc)) return { accepted: false, code: "password_uppercase" };
  if (!/\p{Nd}/u.test(passwordNfc)) return { accepted: false, code: "password_digit" };
  if (!/[^\p{L}\p{N}\s]/u.test(passwordNfc)) return { accepted: false, code: "password_symbol" };
  return { accepted: true, passwordNfc };
}
