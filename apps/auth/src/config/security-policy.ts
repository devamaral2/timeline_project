/** Security durations and limits are deliberately not deployment knobs. */
export const SECURITY_POLICY = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  inviteTtlSeconds: 7 * 24 * 60 * 60,
  authenticationAttemptTtlSeconds: 10 * 60,
  mfaChallengeTtlSeconds: 5 * 60,
  clockToleranceSeconds: 30,
  recoveryCodeCount: 10,
  recoveryCodeEntropyBits: 80,
  signingKeyRetireDelaySeconds: 930,
  maxRequestBodyBytes: 32 * 1024,
} as const;
