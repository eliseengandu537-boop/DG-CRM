import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import 'express-async-errors';
import http from 'http';
import { config } from '@/config';
import apiRoutes from '@/routes';
import { errorHandler, notFoundHandler } from '@/middlewares';
import { initRealtime } from '@/realtime';
import { ensureRequiredUsers, ensureSchemaCompatibility } from '@/services/bootstrapService';
import { ensureDatabaseConsistency } from '@/services/dataIntegrityService';
import { prisma } from '@/lib/prisma';
import { startDealInactivityScheduler } from '@/services/dealInactivityService';
import { logError, logInfo } from '@/lib/logger';

const app: Application = express();
const allowedOrigins = config.FRONTEND_URL.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Middlewares
// Allow larger payloads for document uploads stored in database (base64 data URLs).
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// CORS configuration
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logInfo('Incoming request', {
    method: req.method,
    path: req.path,
  });
  next();
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server (use http server so we can attach Socket.IO)
const PORT = config.PORT;
const ENV = config.NODE_ENV;
const server = http.createServer(app);

initRealtime(server);

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function warmUpDataConnections() {
  await prisma.$connect();
  await prisma.user.findFirst({ select: { id: true } });
  logInfo('Prisma connection ready');
}

async function startServer() {
  await warmUpDataConnections();
  await ensureSchemaCompatibility();
  await ensureDatabaseConsistency();
  await ensureRequiredUsers();

  const scanIntervalMs = Math.max(
    60_000,
    Number.parseInt(process.env.DEAL_INACTIVITY_SCAN_INTERVAL_MS || '', 10) ||
      24 * 60 * 60 * 1000
  );
  startDealInactivityScheduler(scanIntervalMs);

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off('error', handleError);
      logInfo('Server is running', {
        environment: ENV,
        port: PORT,
        frontendUrl: config.FRONTEND_URL,
        socketUrl: config.NEXT_PUBLIC_SOCKET_URL,
      });
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(PORT);
  });
}

void startServer().catch(error => {
  logError('Server startup failed', error, {
    message: toErrorMessage(error),
  });
  process.exit(1);
});

export default app;
