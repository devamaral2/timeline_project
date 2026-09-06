"use client";

import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand/Logo";
import { primaryButtonClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";
import { isStrongPassword, PASSWORD_REQUIREMENTS, passwordRequirements } from "./password-requirements";

type Step =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "form"; token: string; name: string; maskedEmail: string }
  | { kind: "success" };

interface InspectResponse {
  name: string;
  email: string;
  expiresAt: string;
}

interface AcceptResponse {
  accepted: true;
}

/** O token vive no fragmento, que o navegador nao envia ao servidor. */
function readTokenFromHash(): string | null {
  const match = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

async function postAuth<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string; status: number }> {
  const response = await fetch(`/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let code = "unknown";
    try {
      code = (JSON.parse(text) as { code?: string }).code ?? "unknown";
    } catch {
      // Respostas opacas de autenticacao nao possuem corpo.
    }
    return { ok: false, code, status: response.status };
  }
  return { ok: true, data: (await response.json()) as T };
}

const SEMANTIC_MESSAGES: Record<string, string> = {
  password_length: "A senha deve ter entre 8 e 128 caracteres.",
  password_uppercase: "Inclua pelo menos uma letra maiúscula.",
  password_number: "Inclua pelo menos um número.",
  password_special: "Inclua pelo menos um caractere especial.",
  password_control: "A senha contém um caractere inválido.",
  password_context: "A senha não pode ser igual ao seu nome ou e-mail.",
  password_compromised: "Essa senha já apareceu em vazamentos conhecidos. Escolha outra.",
};

function genericErrorMessage(status: number, code: string): string {
  if (status === 401) return "Convite inválido, já utilizado ou expirado.";
  if (status === 503) return "Não foi possível validar a senha agora. Tente novamente em instantes.";
  return SEMANTIC_MESSAGES[code] ?? "Não foi possível aceitar o convite. Tente novamente.";
}

export default function AcceptInvitePage() {
  const [step, setStep] = useState<Step>({ kind: "loading" });

  useEffect(() => {
    const token = readTokenFromHash();
    if (!token) {
      setStep({ kind: "invalid" });
      return;
    }
    void (async () => {
      const result = await postAuth<InspectResponse>("/invites/inspect", { token });
      setStep(result.ok
        ? { kind: "form", token, name: result.data.name, maskedEmail: result.data.email }
        : { kind: "invalid" });
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-sm flex-col">
        <header className="mb-6 flex items-center justify-center gap-3">
          <Logo size={38} />
          <Wordmark className="text-xl" />
        </header>

        {step.kind === "loading" ? <p className="text-center text-sm text-muted-foreground">Verificando convite...</p> : null}
        {step.kind === "invalid" ? <InvalidInvite /> : null}
        {step.kind === "form" ? <AcceptForm step={step} onAccepted={() => setStep({ kind: "success" })} /> : null}
        {step.kind === "success" ? <SuccessPanel /> : null}
      </div>
    </main>
  );
}

function InvalidInvite() {
  return (
    <section className="text-center">
      <h1 className="text-base font-semibold text-foreground">Este convite não é válido</h1>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">Ele pode ter expirado ou já ter sido usado. Peça um novo convite ao administrador.</p>
    </section>
  );
}

function AcceptForm({
  step,
  onAccepted,
}: {
  step: { kind: "form"; token: string; name: string; maskedEmail: string };
  onAccepted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requirements = passwordRequirements(password);
  const passwordsMatch = confirmation.length > 0 && password === confirmation;
  const canSubmit = isStrongPassword(password) && passwordsMatch && !loading;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const result = await postAuth<AcceptResponse>("/invites/accept", { token: step.token, password });

    setLoading(false);
    if (!result.ok) {
      setError(genericErrorMessage(result.status, result.code));
      return;
    }
    onAccepted();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3 text-left">
      <div className="mb-1">
        <h1 className="text-lg font-semibold text-foreground">Olá, {step.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Crie sua senha para aceitar o convite enviado para {step.maskedEmail}.</p>
      </div>

      <PasswordInput label="Senha" value={password} onChange={setPassword} />

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 px-0.5" aria-label="Requisitos da senha">
        {PASSWORD_REQUIREMENTS.map((requirement) => {
          const met = requirements[requirement.id];
          const Icon = met ? Check : Circle;
          return (
            <li key={requirement.id} aria-label={`${requirement.label}: ${met ? "atendido" : "pendente"}`} className={cn("flex items-center gap-1.5 text-xs", met ? "text-success" : "text-muted-foreground")}>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={met ? 2.5 : 1.5} />
              {requirement.label}
            </li>
          );
        })}
      </ul>

      <div>
        <PasswordInput label="Confirmar senha" value={confirmation} onChange={setConfirmation} />
        {confirmation && !passwordsMatch ? <p className="mt-1 px-0.5 text-xs text-destructive">As senhas não coincidem.</p> : null}
      </div>

      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}

      <button type="submit" disabled={!canSubmit} className={cn(primaryButtonClass, "mt-1 w-full")}>
        {loading ? "Aceitando..." : "Aceitar convite"}
      </button>
    </form>
  );
}

function PasswordInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="password"
        required
        maxLength={128}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-input bg-card/40 px-3 text-sm text-foreground transition-colors focus:border-ring"
      />
    </label>
  );
}

function SuccessPanel() {
  return (
    <section className="text-center">
      <span className="mx-auto grid size-9 place-items-center rounded-full bg-success/15 text-success"><Check aria-hidden="true" className="size-5" /></span>
      <h1 className="mt-3 text-base font-semibold text-foreground">Convite aceito</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sua conta foi ativada com sucesso.</p>
      <a href="/" className={cn(primaryButtonClass, "mt-5 w-full")}>Continuar</a>
    </section>
  );
}
