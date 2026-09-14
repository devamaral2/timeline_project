/** Security durations and limits are deliberately not deployment knobs. */
export const SECURITY_POLICY = {
  accessTokenTtlSeconds: 900,
  signupTokenTtlSeconds: 60 * 60,
  guestTokenTtlSeconds: 60 * 60,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  clockToleranceSeconds: 30,
  /**
   * Quanto uma chave `retiring` continua publicada depois do ultimo uso. Tem de
   * cobrir o token de vida mais longa que ela pode ter assinado — hoje os links
   * de signup e guest, de uma hora — mais a tolerancia de relogio. Com os 930 s
   * antigos (so o access token), um link emitido antes de uma rotacao morria em
   * quinze minutos.
   */
  signingKeyRetireDelaySeconds: 60 * 60 + 30,
  maxRequestBodyBytes: 32 * 1024,
} as const;
