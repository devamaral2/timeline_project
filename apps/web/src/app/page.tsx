"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo, Wordmark } from "@/components/brand/Logo";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useCurrentUser } from "@/lib/firebase/use-current-user";

/** As promessas do produto, do material da marca. A primeira e a que se destaca. */
const CLAIMS = ["IA", "Rápido", "Inteligente", "Completo", "Equilibrado"];

export default function TimelinePage() {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace(`/${user.uid}`);
    }
  }, [user, router]);

  if (user) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center text-center duration-500 animate-in fade-in slide-in-from-bottom-3">
        {/* A marca dentro do anel, sem halo: o simbolo ja carrega a cor. */}
        <span className="mb-6 grid size-28 place-items-center rounded-full border border-border bg-card/40">
          <Logo size={72} />
        </span>

        <Wordmark className="text-[32px] leading-10" />

        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          Sua vida organizada.
          <br />
          Sua mente em equilíbrio.
        </p>

        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {CLAIMS.map((claim, index) => (
            <li
              key={claim}
              className={
                index === 0
                  ? "rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground"
                  : "rounded-full border border-border px-3 py-1 text-[12px] font-medium text-muted-foreground"
              }
            >
              {claim}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <GoogleSignInButton />
        </div>
      </div>
    </main>
  );
}
