import { SetMetadata } from "@nestjs/common";

export const ACCESS_RESOURCE_METADATA = "access-resource";
export type AccessResource = "event" | "tag" | "task" | "note" | "recurrence" | "agent";
export type AccessAction = "read" | "create" | "update" | "delete" | "execute";

/** Declares the capability; apps/auth owns the decision. */
export const AccessResource = (resource: AccessResource) => SetMetadata(ACCESS_RESOURCE_METADATA, resource);

export function actionForMethod(method: string, resource: AccessResource): AccessAction {
  if (method === "GET") return "read";
  if (method === "POST") return resource === "agent" ? "execute" : "create";
  if (method === "PATCH" || method === "PUT") return "update";
  if (method === "DELETE") return "delete";
  throw new Error(`Unsupported authorized method: ${method}`);
}
