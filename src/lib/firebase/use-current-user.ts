"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";

export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const auth = getAuth(getClientApp());
    return onAuthStateChanged(auth, setUser);
  }, []);

  return user;
}
