import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "@repo/persistence";

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  displayName?: string;
}

export async function verifyFirebaseToken(token: string): Promise<AuthenticatedUser> {
  const decodedToken = await getAuth(getAdminApp()).verifyIdToken(token);
  return {
    userId: decodedToken.uid,
    email: decodedToken.email,
    displayName: decodedToken.name,
  };
}
