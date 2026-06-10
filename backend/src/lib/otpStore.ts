import { prisma } from '@/lib/prisma';
import { hashPin, verifyPin } from '@/helpers';

/**
 * Database-backed store for short-lived login OTP codes.
 *
 * Codes are kept hashed (never in plaintext), expire quickly, and are limited
 * to a small number of verification attempts before being invalidated. Storing
 * them in Postgres (rather than in process memory) means they survive a backend
 * restart and are shared correctly when more than one backend instance runs.
 *
 * The backing table is created on demand with `CREATE TABLE IF NOT EXISTS`, so
 * no Prisma migration / deploy step is required — important because the
 * production container starts the server directly without running migrations.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds between sends

const TABLE = 'login_otps';

let ensurePromise: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${TABLE}" (
          "user_id" TEXT PRIMARY KEY,
          "code_hash" TEXT NOT NULL,
          "expires_at" TIMESTAMPTZ NOT NULL,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .then(() => undefined)
      .catch((error) => {
        // Allow a later call to retry if table creation failed transiently.
        ensurePromise = null;
        throw error;
      });
  }
  return ensurePromise;
}

type OtpRow = {
  code_hash: string;
  expires_at: Date;
  attempts: number;
  last_sent_at: Date;
};

async function getRow(userId: string): Promise<OtpRow | null> {
  const rows = await prisma.$queryRaw<OtpRow[]>`
    SELECT "code_hash", "expires_at", "attempts", "last_sent_at"
    FROM "login_otps"
    WHERE "user_id" = ${userId}
    LIMIT 1
  `;
  return rows[0] || null;
}

export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  const min = 10 ** (OTP_LENGTH - 1);
  return Math.floor(min + Math.random() * (max - min)).toString();
}

/** Returns the remaining cooldown in ms before another code can be sent (0 if ready). */
export async function getResendCooldownMs(userId: string): Promise<number> {
  await ensureTable();
  const row = await getRow(userId);
  if (!row) return 0;
  const elapsed = Date.now() - new Date(row.last_sent_at).getTime();
  return elapsed >= OTP_RESEND_COOLDOWN_MS ? 0 : OTP_RESEND_COOLDOWN_MS - elapsed;
}

/** True when an unexpired OTP challenge already exists for the user. */
export async function hasPendingOtp(userId: string): Promise<boolean> {
  await ensureTable();
  const row = await getRow(userId);
  if (!row) return false;
  if (Date.now() > new Date(row.expires_at).getTime()) {
    await clearOtp(userId);
    return false;
  }
  return true;
}

export async function saveOtp(userId: string, code: string): Promise<void> {
  await ensureTable();
  const codeHash = await hashPin(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.$executeRaw`
    INSERT INTO "login_otps" ("user_id", "code_hash", "expires_at", "attempts", "last_sent_at")
    VALUES (${userId}, ${codeHash}, ${expiresAt}, 0, NOW())
    ON CONFLICT ("user_id") DO UPDATE SET
      "code_hash" = EXCLUDED."code_hash",
      "expires_at" = EXCLUDED."expires_at",
      "attempts" = 0,
      "last_sent_at" = NOW()
  `;
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch' };

export async function verifyOtp(userId: string, code: string): Promise<OtpVerifyResult> {
  await ensureTable();
  const row = await getRow(userId);
  if (!row) {
    return { ok: false, reason: 'not_found' };
  }

  if (Date.now() > new Date(row.expires_at).getTime()) {
    await clearOtp(userId);
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await clearOtp(userId);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const matches = await verifyPin(code, row.code_hash);
  if (!matches) {
    await prisma.$executeRaw`
      UPDATE "login_otps" SET "attempts" = "attempts" + 1 WHERE "user_id" = ${userId}
    `;
    return { ok: false, reason: 'mismatch' };
  }

  // Single-use: consume on success.
  await clearOtp(userId);
  return { ok: true };
}

export async function clearOtp(userId: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM "login_otps" WHERE "user_id" = ${userId}`;
}
