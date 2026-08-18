import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAdminApp } from "./admin-app";

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
