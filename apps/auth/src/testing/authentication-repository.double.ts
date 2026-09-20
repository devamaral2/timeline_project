import type { AuthenticationRepository } from "../features/basic-login/ports/authentication-repository";

/**
 * Dublê da porta de autenticação para testes de usecase. Todo método que o
 * teste nao declarar explode ao ser chamado: um usecase que fale com o banco
 * fora do caminho previsto falha o teste em vez de passar em silencio.
 *
 * Sem `vitest` aqui de proposito -- este arquivo entra no `tsc -p
 * tsconfig.build.json`, que so exclui `*.test.ts`. Quem precisa de spy passa um
 * `vi.fn()` pelo `overrides`.
 */
export function fakeAuthenticationRepository(overrides: Partial<AuthenticationRepository> = {}): AuthenticationRepository {
  const unexpected = (name: string) => async (): Promise<never> => { throw new Error(`unexpected call to ${name}`); };
  return {
    completeLogin: unexpected("completeLogin"),
    ...overrides,
  } as AuthenticationRepository;
}
