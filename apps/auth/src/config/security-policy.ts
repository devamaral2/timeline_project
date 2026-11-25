/** Security durations and limits are deliberately not deployment knobs. */
export const SECURITY_POLICY = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  inviteTtlSeconds: 7 * 24 * 60 * 60,
  clockToleranceSeconds: 30,
  signingKeyRetireDelaySeconds: 930,
  maxRequestBodyBytes: 32 * 1024,
  /**
   * A unica rota com corpo maior: `POST /api/tasks/daily-reading` recebe o
   * markdown de uma pagina inteira. O teto e o mesmo da API (apps/api).
   */
  largeBodyPaths: ["/api/tasks/daily-reading"],
  maxLargeRequestBodyBytes: 1024 * 1024,
} as const;
