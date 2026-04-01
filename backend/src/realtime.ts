import http from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '@/config';
import { verifyToken } from '@/helpers';
import { prisma } from '@/lib/prisma';
import { JwtPayload, User } from '@/types';
import { isAuthenticatableRole } from '@/lib/authRoles';
import { logError, logInfo, logWarn } from '@/lib/logger';

let io: Server | null = null;
const PRIVILEGED_ROLES: User['role'][] = ['admin', 'manager'];

type RealtimeUser = {
  id: string;
  role: User['role'];
  brokerId: string | null;
};

type EmitScopedEventArgs = {
  event: string;
  payload: unknown;
  brokerId?: string | null;
  roles?: User['role'][];
  userIds?: string[];
  includePrivileged?: boolean;
};

function normalizeBearerToken(raw?: string): string | null {
  if (!raw) return null;
  if (!raw.startsWith('Bearer ')) return raw.trim() || null;
  return raw.slice(7).trim() || null;
}

function getTokenFromSocket(socket: Socket): string | null {
  const authTokenRaw = socket.handshake.auth?.token;
  if (typeof authTokenRaw === 'string') {
    return normalizeBearerToken(authTokenRaw);
  }

  const headerTokenRaw = socket.handshake.headers.authorization;
  if (typeof headerTokenRaw === 'string') {
    return normalizeBearerToken(headerTokenRaw);
  }

  return null;
}

async function resolveRealtimeUser(token: string): Promise<RealtimeUser | null> {
  try {
    const decoded = verifyToken(token) as JwtPayload;
    const found = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!found) return null;
    if (!isAuthenticatableRole(found.role)) {
      return null;
    }

    let brokerId: string | null = decoded.brokerId || null;
    if (found.role === 'broker') {
      const brokerProfile = await prisma.broker.findUnique({
        where: { email: found.email.toLowerCase() },
      });
      brokerId = brokerProfile?.id || brokerId;
    }

    return {
      id: found.id,
      role: found.role as User['role'],
      brokerId,
    };
  } catch (error) {
    logWarn('Realtime authentication failed', {
      reason: 'token_verification_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function emitToRoleRooms(event: string, payload: unknown, roles: User['role'][]) {
  if (!io) return;
  for (const role of roles) {
    io.to(`role:${role}`).emit(event, payload);
  }
}

function emitToBrokerRoom(event: string, payload: unknown, brokerId?: string | null) {
  if (!io || !brokerId) return;
  io.to(`broker:${brokerId}`).emit(event, payload);
}

function emitToUserRooms(event: string, payload: unknown, userIds?: string[]) {
  if (!io || !userIds || userIds.length === 0) return;
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  for (const userId of uniqueIds) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitScopedEvent(args: EmitScopedEventArgs) {
  if (!io) throw new Error('Realtime not initialized');

  if (args.includePrivileged !== false) {
    emitToRoleRooms(args.event, args.payload, PRIVILEGED_ROLES);
  }

  if (args.roles && args.roles.length > 0) {
    emitToRoleRooms(args.event, args.payload, args.roles);
  }

  emitToBrokerRoom(args.event, args.payload, args.brokerId);
  emitToUserRooms(args.event, args.payload, args.userIds);
}

export function emitDashboardRefresh(params: { type: string; id?: string; brokerId?: string | null }) {
  emitScopedEvent({
    event: 'dashboard:refresh',
    payload: { type: params.type, id: params.id },
    brokerId: params.brokerId,
    includePrivileged: true,
  });
}

export function initRealtime(server: http.Server) {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: config.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = getTokenFromSocket(socket);
    if (!token) {
      logWarn('Socket authentication failed', {
        socketId: socket.id,
        reason: 'missing_token',
        address: socket.handshake.address,
      });
      return next(new Error('Authentication required'));
    }

    const user = await resolveRealtimeUser(token);
    if (!user) {
      logWarn('Socket authentication failed', {
        socketId: socket.id,
        reason: 'invalid_token_or_user',
        address: socket.handshake.address,
      });
      return next(new Error('Invalid or expired token'));
    }

    socket.data.user = user;
    return next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as RealtimeUser;

    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    if (user.brokerId) {
      socket.join(`broker:${user.brokerId}`);
    }

    logInfo('Realtime client connected', {
      socketId: socket.id,
      userId: user.id,
      role: user.role,
      brokerId: user.brokerId,
    });

    socket.on('ping', () => socket.emit('pong'));

    socket.on('error', (error) => {
      logWarn('Realtime socket error', {
        socketId: socket.id,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    socket.on('disconnect', (reason) => {
      logInfo('Realtime client disconnected', {
        socketId: socket.id,
        userId: user.id,
        reason,
      });
    });
  });

  io.engine.on('connection_error', (error) => {
    logError('Realtime transport connection error', error, {
      code: (error as any)?.code,
      message: (error as any)?.message,
    });
  });

  return io;
}

export function getIo() {
  if (!io) throw new Error('Realtime not initialized');
  return io;
}
