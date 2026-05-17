import { Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { JwtPayload } from '../auth/jwt.strategy';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

@Injectable()
export class RealtimeGateway implements OnModuleInit {
  private io!: Server;
  private readonly log = new Logger(RealtimeGateway.name);

  constructor(private readonly jwt: JwtService) {}

  onModuleInit(): void {
    // Socket.IO server is attached in main.ts after NestJS bootstraps
  }

  attach(httpServer: unknown): void {
    const pub = new Redis(redisUrl);
    const sub = new Redis(redisUrl);

    // FIXME(any): socket.io Server constructor HttpServer type is opaque — no typed alternative
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
    this.io = new Server(httpServer as any, {
      path: '/socket.io',
      cors: { origin: '*' },
      adapter: createAdapter(pub, sub) as any,
    });
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */

    // JWT auth middleware
    this.io.use((socket, next) => {
      const token = (socket.handshake.auth as Record<string, string>)['token'] as
        | string
        | undefined;
      if (!token) return next(new Error('unauthorized'));
      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        (socket.data as Record<string, unknown>)['session'] = payload;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    this.io.on('connection', (socket) => {
      const session = (socket.data as Record<string, unknown>)['session'] as JwtPayload;
      void socket.join(`tenant:${session.tenantId}`);
      this.log.log(`Client connected: tenant=${session.tenantId}`);

      socket.on('disconnect', () => {
        this.log.log(`Client disconnected: tenant=${session.tenantId}`);
      });
    });

    // Bridge Redis pub/sub → Socket.IO rooms
    const subscriber = new Redis(redisUrl);
    void subscriber.psubscribe('events:*');
    subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const parts = channel.split(':');
      const tenantId = parts[1];
      if (!tenantId) return;
      try {
        const payload = JSON.parse(message) as unknown;
        this.io.to(`tenant:${tenantId}`).emit('event', payload);
      } catch {
        // malformed message — ignore
      }
    });

    this.log.log('Socket.IO server attached at /socket.io');
  }
}
