import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type PrismaLike = Prisma.TransactionClient | typeof prisma;

export function normalizeLegalDocumentReference(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

export async function resolveLegalDocumentReferenceId(
  client: PrismaLike,
  reference: string | null | undefined
): Promise<string | null | undefined> {
  const normalizedReference = normalizeLegalDocumentReference(reference);
  if (normalizedReference === undefined) return undefined;
  if (normalizedReference === null) return null;

  const document = await client.legalDocument.findFirst({
    where: {
      OR: [{ id: normalizedReference }, { filePath: normalizedReference }],
    },
    select: { id: true },
  });

  return document?.id || null;
}

export async function assertLegalDocumentReferenceExists(
  client: PrismaLike,
  reference: string | null | undefined,
  errorMessage = 'Linked legal document not found'
): Promise<string | null | undefined> {
  const normalizedReference = normalizeLegalDocumentReference(reference);
  if (normalizedReference === undefined) return undefined;
  if (normalizedReference === null) return null;

  const resolvedId = await resolveLegalDocumentReferenceId(client, normalizedReference);
  if (!resolvedId) {
    throw new Error(errorMessage);
  }

  return resolvedId;
}
