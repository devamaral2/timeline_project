/**
 * A policy do proxy Auth -> API, sem framework. O caminho chega sem query,
 * como no `request.path` do Express: só o recurso e a ação interessam aqui.
 */
export function policyFor(method: string, path: string): {
  resource: "task" | "tag" | "artifact" | "recurrence" | "agent";
  action: "read" | "create" | "update" | "delete" | "execute";
} {
  const resource = path.startsWith("/api/tasks") ? "task"
    : path.startsWith("/api/tags") ? "tag"
    : path.startsWith("/api/artifacts") ? "artifact"
    : path.startsWith("/api/recurrences") ? "recurrence"
    : path.startsWith("/api/ai") || path.startsWith("/api/requests") ? "agent"
    : null;
  if (!resource) throw new Error(`No gateway policy for ${path}`);
  const action = method === "GET" ? "read"
    : method === "POST" ? (resource === "agent" ? "execute" : "create")
    : method === "PATCH" || method === "PUT" ? "update"
    : method === "DELETE" ? "delete"
    : null;
  if (!action) throw new Error(`No gateway policy for ${method} ${path}`);
  return { resource, action };
}
