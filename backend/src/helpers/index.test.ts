import { formatPhoneNumber, generateRandomString } from '@/helpers';

describe('helpers', () => {
  it('formatPhoneNumber strips non-digit characters and keeps last 10 digits', () => {
    expect(formatPhoneNumber('+1 (234) 567-8901')).toBe('2345678901');
    expect(formatPhoneNumber('001-555-123-4567')).toBe('5551234567');
  });

  it('generateRandomString returns expected length', () => {
    const value = generateRandomString(24);
    expect(value).toHaveLength(24);
  });
});
