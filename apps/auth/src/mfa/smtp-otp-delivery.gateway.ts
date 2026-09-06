import { createTransport, type Transporter } from "nodemailer";
import { RequiredDependencyUnavailableError } from "../common/errors";
import type { OtpDeliveryGateway } from "./otp-delivery.gateway";

export interface SmtpOtpDeliveryConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  timeoutMs: number;
}

/**
 * Entrega o codigo por email via SMTP generico (nodemailer), sem SDK de
 * provedor pago: qualquer servidor SMTP -- Gmail com app password, Brevo,
 * Mailtrap em desenvolvimento -- serve. `user`/`pass` sao opcionais porque um
 * relay local de teste (MailHog, Mailtrap sandbox) muitas vezes nao pede
 * autenticacao.
 */
export class SmtpOtpDeliveryGateway implements OtpDeliveryGateway {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpOtpDeliveryConfig, transporter?: Transporter) {
    this.from = config.from;
    this.transporter = transporter ?? createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
    });
  }

  async send(input: { email: string; code: string }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.email,
        subject: "Seu código de verificação",
        text: `Seu código de verificação é ${input.code}. Ele expira em poucos minutos e não deve ser compartilhado com ninguém.`,
      });
    } catch (error) {
      throw new RequiredDependencyUnavailableError("smtp send", { cause: error });
    }
  }
}
