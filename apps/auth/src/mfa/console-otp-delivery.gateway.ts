import type { OtpDeliveryGateway } from "./otp-delivery.gateway";

/**
 * Gateway de desenvolvimento/teste: nunca sai para a rede, so escreve o codigo
 * no stdout. Existe para o mesmo papel que o antigo `FakeOtpVerificationGateway`
 * cobria -- so pode ser escolhido pelo `AUTH_OTP_PROVIDER=fake`, que por sua
 * vez so e aceito fora de producao (ver `config/env.ts`).
 */
export class ConsoleOtpDeliveryGateway implements OtpDeliveryGateway {
  async send(input: { email: string; code: string }): Promise<void> {
    process.stdout.write(`[otp] ${input.email}: ${input.code}\n`);
  }
}
