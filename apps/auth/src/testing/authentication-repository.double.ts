import type { AuthenticationRepository } from "../mfa/ports/authentication-repository";

/**
 * Dublê da porta de autenticacao para testes de usecase. Todo metodo que o
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
    startInviteAttempt: unexpected("startInviteAttempt"),
    startLoginAttempt: unexpected("startLoginAttempt"),
    startStepUpAttempt: unexpected("startStepUpAttempt"),
    prepareOtpCheck: unexpected("prepareOtpCheck"),
    attemptPurpose: unexpected("attemptPurpose"),
    prepareMfaResend: unexpected("prepareMfaResend"),
    replaceMfaChallenge: unexpected("replaceMfaChallenge"),
    invalidateOtpChallenge: unexpected("invalidateOtpChallenge"),
    recordAuditEvent: unexpected("recordAuditEvent"),
    markStepUpVerified: unexpected("markStepUpVerified"),
    markStepUpVerifiedWithRecovery: unexpected("markStepUpVerifiedWithRecovery"),
    completeInviteEnrollment: unexpected("completeInviteEnrollment"),
    completeLogin: unexpected("completeLogin"),
    completeLoginWithoutMfa: unexpected("completeLoginWithoutMfa"),
    changePasswordWithStepUp: unexpected("changePasswordWithStepUp"),
    regenerateRecoveryCodesWithStepUp: unexpected("regenerateRecoveryCodesWithStepUp"),
    ...overrides,
  } as AuthenticationRepository;
}
