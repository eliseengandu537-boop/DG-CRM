type LogLevel = 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown> | undefined;

function normalizeError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}

function writeLog(level: LogLevel, message: string, meta?: LogMeta): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(JSON.stringify(payload));
}

export function logInfo(message: string, meta?: LogMeta): void {
  writeLog('info', message, meta);
}

export function logWarn(message: string, meta?: LogMeta): void {
  writeLog('warn', message, meta);
}

export function logError(message: string, error?: unknown, meta?: LogMeta): void {
  writeLog('error', message, {
    ...(meta || {}),
    ...(error ? { error: normalizeError(error) } : {}),
  });
}
