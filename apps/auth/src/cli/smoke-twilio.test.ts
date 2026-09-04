import { describe, expect, it } from 'vitest';
import { parseTwilioSmokeArguments } from './smoke-twilio';

describe('parseTwilioSmokeArguments', () => {
  it('accepts an explicit E.164 destination and enabled channel', () => {
    expect(parseTwilioSmokeArguments(['--to', '+5511999999999', '--channel', 'sms'])).toEqual({ to: '+5511999999999', channel: 'sms' });
  });
  it('rejects ambiguous input before contacting Twilio', () => {
    expect(() => parseTwilioSmokeArguments(['--to', '11999999999', '--channel', 'email'])).toThrow('usage:');
  });
});
