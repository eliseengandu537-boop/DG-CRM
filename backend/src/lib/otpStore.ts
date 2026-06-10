import { hashPin, verifyPin } from '@/helpers';

/**
 * In-memory store for short-lived login OTP codes.
 *
 * Codes are kept hashed (never in plaintext), expire quickly, and are limited
 * to a small number of verification attempts before being invalidated. An
 * in-memory store is used deliberately: OTPs are single-use and short-lived, so
 * losing them on a process restart simply means the user requests a new code —
 * no database migration is required.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds between sends

type OtpEntry = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

const store = new Map<string, OtpEntry>();

export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  const min = 10 ** (OTP_LENGTH - 1);
  return Math.floor(min + Math.random() * (max - min)).toString();
}

/** Returns the remaining cooldown in ms before another code can be sent (0 if ready). */
export function getResendCooldownMs(userId: string): number {
  const entry = store.get(userId);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.lastSentAt;
  return elapsed >= OTP_RESEND_COOLDOWN_MS ? 0 : OTP_RESEND_COOLDOWN_MS - elapsed;
}

/** True when an unexpired OTP challenge already exists for the user. */
export function hasPendingOtp(userId: string): boolean {
  const entry = store.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(userId);
    return false;
  }
  return true;
}

export async function saveOtp(userId: string, code: string): Promise<void> {
  const codeHash = await hashPin(code);
  store.set(userId, {
    codeHash,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch' };

export async function verifyOtp(userId: string, code: string): Promise<OtpVerifyResult> {
  const entry = store.get(userId);
  if (!entry) {
    return { ok: false, reason: 'not_found' };
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(userId);
    return { ok: false, reason: 'expired' };
  }

  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    store.delete(userId);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const matches = await verifyPin(code, entry.codeHash);
  if (!matches) {
    entry.attempts += 1;
    return { ok: false, reason: 'mismatch' };
  }

  // Single-use: consume on success.
  store.delete(userId);
  return { ok: true };
}

export function clearOtp(userId: string): void {
  store.delete(userId);
}
