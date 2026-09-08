// Legacy standalone diagnostic; Twilio is no longer the auth MFA provider.
import { findMonorepoRoot, loadRootEnv } from '../config/load-env';
import { TwilioVerifyGateway } from '../mfa/twilio-verify.gateway';
import { parseTwilioSmokeArguments } from './smoke-twilio';
async function main(): Promise<void> {
  const args = parseTwilioSmokeArguments(process.argv.slice(2));
  const env = loadRootEnv(findMonorepoRoot(__dirname), process.env);
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SERVICE_SID) throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID are required');
  const gateway = new TwilioVerifyGateway({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID, timeoutMs: 5000, whatsappEnabled: env.AUTH_TWILIO_WHATSAPP_ENABLED === 'true' });
  await gateway.start({ phoneE164: args.to, channel: args.channel });
  process.stdout.write(JSON.stringify({ delivered: true, channel: args.channel }) + '\n');
}
void main().catch(() => { process.exitCode = 1; });
