const requiredClientEnv = ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SOCKET_URL'] as const;

type RequiredClientEnv = (typeof requiredClientEnv)[number];

const rawClientEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
} as const;

function requireClientEnv(name: RequiredClientEnv, value: string | undefined): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    throw new Error(`${name} environment variable is required`);
  }

  return trimmedValue;
}

const apiTimeoutMs = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000);
const parsedApiTimeoutMs = Number.isFinite(apiTimeoutMs) && apiTimeoutMs > 0 ? apiTimeoutMs : 20000;

export const clientEnv = {
  // Use static property access so Next.js can inline NEXT_PUBLIC_* values in browser bundles.
  NEXT_PUBLIC_API_URL: requireClientEnv('NEXT_PUBLIC_API_URL', rawClientEnv.NEXT_PUBLIC_API_URL),
  NEXT_PUBLIC_SOCKET_URL: requireClientEnv('NEXT_PUBLIC_SOCKET_URL', rawClientEnv.NEXT_PUBLIC_SOCKET_URL),
  NEXT_PUBLIC_API_TIMEOUT_MS: parsedApiTimeoutMs,
};
