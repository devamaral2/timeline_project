"use client";

let inFlight: Promise<boolean> | null = null;

/**
 * Renova a sessao por POST /api/session/refresh. Devolve se deu certo.
 *
 * O apps/auth rotaciona o refresh token e trata a reapresentacao de um token ja
 * usado como roubo: derruba a sessao inteira. Por isso duas renovacoes nunca
 * podem sair com o mesmo cookie. Dentro da aba, chamadas simultaneas
 * compartilham a mesma promessa; entre abas, o Web Locks serializa — como o
 * cookie e um so para o navegador, a segunda aba ja envia o token novo.
 */
export function refreshSession(): Promise<boolean> {
  inFlight ??= withRefreshLock(async () => {
    const response = await fetch("/api/session/refresh", { method: "POST", credentials: "same-origin" });
    return response.ok;
  })
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function withRefreshLock(run: () => Promise<boolean>): Promise<boolean> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return run();
  // A tipagem do lib.dom embrulha a promessa do callback duas vezes; o await achata.
  return (await locks.request("braid-session-refresh", run)) as boolean;
}
