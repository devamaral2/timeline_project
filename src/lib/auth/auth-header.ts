export function getBearerToken(headers: Headers): string {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Error("Missing bearer token");
  return token;
}
