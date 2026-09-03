/** JWT usa base64url sem padding em toda parte — header, payload e assinatura. */
export function encodeBase64Url(value: Buffer | string): string {
  return Buffer.from(value as never).toString("base64url");
}

export function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
