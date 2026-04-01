export function isDatabaseConnectionError(error: unknown): boolean {
  const rawMessage =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

  const message = rawMessage.toLowerCase();
  const code = rawCode.toLowerCase();

  return (
    code === 'p1001' ||
    code === 'p2010' ||
    message.includes('server selection timeout') ||
    message.includes('replicasetnoprimary') ||
    message.includes('connectorerror') ||
    message.includes('authentication failed') ||
    message.includes('timed out') ||
    message.includes('connection') ||
    message.includes('prisma') ||
    message.includes('fatal alert')
  );
}

