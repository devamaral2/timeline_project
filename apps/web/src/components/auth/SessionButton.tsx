"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { outlineButtonClass } from "@/components/ui/button-styles";
import { signOut, useCurrentUser } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";

interface SessionButtonProps {
  /** No cabecalho estreito, preserva o nome acessivel e mostra so o simbolo. */
  compactOnMobile?: boolean;
}

/** "Sair" para quem esta logado; "Entrar" leva a tela de login. */
export function SessionButton({ compactOnMobile = false }: SessionButtonProps) {
  const user = useCurrentUser();
  const router = useRouter();
  const className = cn(outlineButtonClass, compactOnMobile ? "w-10 px-0 sm:w-auto sm:px-4" : null);
  const labelClass = compactOnMobile ? "sr-only sm:not-sr-only" : undefined;
  const iconClass = "size-4 sm:hidden";

  if (!user) {
    return (
      <Link href="/" className={className}>
        {compactOnMobile ? <LogIn aria-hidden className={iconClass} /> : null}
        <span className={labelClass}>Entrar</span>
      </Link>
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <button type="button" onClick={() => void handleSignOut()} className={className}>
      {compactOnMobile ? <LogOut aria-hidden className={iconClass} /> : null}
      <span className={labelClass}>Sair</span>
    </button>
  );
}
