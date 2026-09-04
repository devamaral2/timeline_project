import type { MfaChannel } from '../mfa/mfa-challenge';

export interface TwilioSmokeArguments { to: string; channel: MfaChannel; }

export function parseTwilioSmokeArguments(values: string[]): TwilioSmokeArguments {
  if (values.length !== 4 || values[0] !== '--to' || values[2] !== '--channel' || !/^\+[1-9]\d{7,14}$/.test(values[1]) || (values[3] !== 'sms' && values[3] !== 'whatsapp')) {
    throw new Error('usage: smoke-twilio --to E164_PHONE --channel sms|whatsapp');
  }
  return { to: values[1], channel: values[3] };
}
