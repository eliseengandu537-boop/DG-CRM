import { prisma } from '@/lib/prisma';

export async function saveRefreshTokenHash(userId: string, tokenHash: string): Promise<void> {
  const db = prisma as any;
  await db.refreshToken.upsert({
    where: { userId },
    update: { tokenHash },
    create: { userId, tokenHash },
  });
}

export async function getRefreshTokenHash(userId: string): Promise<string | null> {
  const db = prisma as any;
  const found = await db.refreshToken.findUnique({
    where: { userId },
    select: { tokenHash: true },
  });
  return found?.tokenHash || null;
}

export async function deleteRefreshTokenHash(userId: string): Promise<void> {
  const db = prisma as any;
  await db.refreshToken.deleteMany({ where: { userId } });
}
