/**
 * Extrai o token do header `Authorization`. Recebe o valor cru do header em vez
 * de um `Headers` do fetch porque quem chama e o guard do Nest, que le do
 * request do Express.
 */
export function getBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Error("Missing bearer token");
  return token;
}
