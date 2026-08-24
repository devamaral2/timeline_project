"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useCurrentUser } from "@/lib/firebase/use-current-user";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Routine Tracker
      </h1>
      <GoogleSignInButton />
    </main>
  );
}
