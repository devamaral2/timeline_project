export interface PasswordRequirement {
  id: "length" | "uppercase" | "number" | "special";
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  { id: "length", label: "8 caracteres", test: (password) => [...password.normalize("NFC")].length >= 8 },
  { id: "uppercase", label: "1 letra maiúscula", test: (password) => /\p{Lu}/u.test(password.normalize("NFC")) },
  { id: "number", label: "1 número", test: (password) => /[0-9]/.test(password) },
  { id: "special", label: "1 caractere especial", test: (password) => /[^\p{L}\p{N}\s]/u.test(password.normalize("NFC")) },
];

export function passwordRequirements(password: string): Record<PasswordRequirement["id"], boolean> {
  return Object.fromEntries(PASSWORD_REQUIREMENTS.map((requirement) => [requirement.id, requirement.test(password)])) as Record<PasswordRequirement["id"], boolean>;
}

export function isStrongPassword(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}
