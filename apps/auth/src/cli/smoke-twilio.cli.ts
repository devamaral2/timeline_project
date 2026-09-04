import { getRuntimeEnv } from '../config/env';
import { findMonorepoRoot, loadRootEnv } from '../config/load-env';
import { TwilioVerifyGateway } from '../mfa/twilio-verify.gateway';
import { parseTwilioSmokeArguments } from './smoke-twilio';
async function main(): Promise<void> {
  const args = parseTwilioSmokeArguments(process.argv.slice(2));
  const env = getRuntimeEnv(loadRootEnv(findMonorepoRoot(__dirname), process.env));
  if (env.otpProvider !== 'twilio' || !env.twilioAccountSid || !env.twilioAuthToken || !env.twilioVerifyServiceSid) throw new Error('AUTH_OTP_PROVIDER=twilio is required');
  const gateway = new TwilioVerifyGateway({ accountSid: env.twilioAccountSid, authToken: env.twilioAuthToken, verifyServiceSid: env.twilioVerifyServiceSid, timeoutMs: env.twilioTimeoutMs, whatsappEnabled: env.twilioWhatsappEnabled });
  await gateway.start({ phoneE164: args.to, channel: args.channel });
  process.stdout.write(JSON.stringify({ delivered: true, channel: args.channel }) + '\n');
}
void main().catch(() => { process.exitCode = 1; });
