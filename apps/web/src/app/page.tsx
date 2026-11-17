"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import styles from "@/components/auth/login.module.css";
import { useSessionState } from "@/lib/session/use-session";

export default function TimelinePage() {
  const { user, ready } = useSessionState();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace(`/${user.userId}`);
    }
  }, [user, router]);

  // Antes de o servidor responder, nem o formulario: quem ja tem sessao veria
  // a tela de login piscar antes do redirecionamento.
  if (user || !ready) {
    return null;
  }

  return (
    <div className={styles.screen}>
      <main className={styles.frame}>
        <section className={styles.brand} aria-label="Agente pessoal">
          <h1>Agente pessoal</h1>
          <p>
            Sua vida organizada.
            <br />
            Sua mente em equilíbrio.
          </p>
        </section>
        <section className={styles.access} aria-label="Entrar na conta">
          <LoginForm />
        </section>
      </main>
    </div>
  );
}
