import dotenv from 'dotenv';
import path from 'path';
import { logError } from '@/lib/logger';

const backendRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(backendRoot, '..');

const envFiles = [
  path.join(backendRoot, '.env.local'),
  path.join(backendRoot, '.env'),
  path.join(workspaceRoot, '.env.local'),
  path.join(workspaceRoot, '.env'),
];

for (const envFile of envFiles) {
  dotenv.config({ path: envFile });
}

const UNSAFE_JWT_SECRET_PLACEHOLDER = 'your_jwt_secret_key_here_change_in_production';
const UNSAFE_JWT_REFRESH_SECRET_PLACEHOLDER =
  'your_refresh_jwt_secret_key_here_change_in_production';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function validateFrontendOrigins(rawValue: string): string {
  const origins = rawValue
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('FRONTEND_URL must include at least one origin');
  }

  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`FRONTEND_URL contains an invalid origin: ${origin}`);
    }
  }

  return origins.join(',');
}

function validatePublicUrl(name: 'NEXT_PUBLIC_SOCKET_URL' | 'NEXT_PUBLIC_API_URL'): string {
  const value = requireEnv(name);

  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  return value;
}

function requireJwtSecret(
  name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET',
  unsafePlaceholder: string
): string {
  const value = requireEnv(name);
  if (value === unsafePlaceholder) {
    throw new Error(`${name} must be configured with a non-default value`);
  }

  return value;
}

function assertOfflineAuthConfiguration(nodeEnv: string): void {
  const offlineAuthRaw = String(process.env.ENABLE_OFFLINE_AUTH || '').trim().toLowerCase();
  if (nodeEnv === 'production' && offlineAuthRaw === 'true') {
    throw new Error(
      'ENABLE_OFFLINE_AUTH=true is not allowed in production. Disable offline auth before starting the server.'
    );
  }
}

function buildConfig() {
  const missingVariables = ['DATABASE_URL', 'NEXT_PUBLIC_SOCKET_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL']
    .filter(name => !process.env[name]?.trim());

  if (missingVariables.length > 0) {
    logError('Missing required environment variables', undefined, {
      missingVariables,
    });
    throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`);
  }

  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
  assertOfflineAuthConfiguration(nodeEnv);

  const databaseUrl = requireEnv('DATABASE_URL');
  const socketUrl = validatePublicUrl('NEXT_PUBLIC_SOCKET_URL');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim()
    ? validatePublicUrl('NEXT_PUBLIC_API_URL')
    : undefined;

  return {
    PORT: process.env.PORT || 5000,
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    NEXT_PUBLIC_SOCKET_URL: socketUrl,
    NEXT_PUBLIC_API_URL: apiUrl,
    JWT_SECRET: requireJwtSecret('JWT_SECRET', UNSAFE_JWT_SECRET_PLACEHOLDER),
    JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
    JWT_REFRESH_SECRET: requireJwtSecret(
      'JWT_REFRESH_SECRET',
      UNSAFE_JWT_REFRESH_SECRET_PLACEHOLDER
    ),
    JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '7d',
    FRONTEND_URL: validateFrontendOrigins(requireEnv('FRONTEND_URL')),
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER,
    SMTP_SECURE: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    SMTP_REQUIRE_TLS: String(process.env.SMTP_REQUIRE_TLS || 'true').toLowerCase() === 'true',
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL?.trim().toLowerCase() || '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD?.trim() || '',
    ADMIN_NAME: process.env.ADMIN_NAME?.trim() || 'Administrator',
    MANAGER_EMAIL: process.env.MANAGER_EMAIL?.trim().toLowerCase() || '',
    MANAGER_PASSWORD: process.env.MANAGER_PASSWORD?.trim() || '',
    MANAGER_NAME: process.env.MANAGER_NAME?.trim() || 'Manager',
  };
}

export const config = buildConfig();

process.env.DATABASE_URL = config.DATABASE_URL;
process.env.NEXT_PUBLIC_SOCKET_URL = config.NEXT_PUBLIC_SOCKET_URL;
if (config.NEXT_PUBLIC_API_URL) {
  process.env.NEXT_PUBLIC_API_URL = config.NEXT_PUBLIC_API_URL;
}
