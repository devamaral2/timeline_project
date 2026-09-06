export const OTP_DELIVERY_GATEWAY = Symbol("OTP_DELIVERY_GATEWAY");

/**
 * Entrega o codigo de 2FA. So entrega -- nunca confere. A conferencia e local
 * (hash comparado contra `mfa_challenges.code_hash`), entao este gateway nao
 * tem `check`: um provedor de email fora do ar bloqueia o envio, nunca a
 * verificacao de quem ja recebeu o codigo.
 */
export interface OtpDeliveryGateway {
  send(input: { email: string; code: string }): Promise<void>;
}
