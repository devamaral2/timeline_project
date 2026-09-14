/** Security durations and limits are deliberately not deployment knobs. */
export const SECURITY_POLICY = {
  accessTokenTtlSeconds: 900,
  signupTokenTtlSeconds: 60 * 60,
  guestTokenTtlSeconds: 60 * 60,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  inviteTtlSeconds: 7 * 24 * 60 * 60,
  clockToleranceSeconds: 30,
  signingKeyRetireDelaySeconds: 930,
  maxRequestBodyBytes: 32 * 1024,
} as const;
