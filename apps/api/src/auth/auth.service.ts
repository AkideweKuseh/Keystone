import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '@sam/auth';
import { PrismaService } from '@sam/persistence';
import type { JwtPayload } from './jwt.strategy';

const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<TokenPair & { user: { id: string; email: string; role: string } }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });

    if (!admin || !admin.isActive) throw new UnauthorizedException('Invalid credentials');

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked');
    }

    const valid = await this.passwords.verify(admin.passwordHash, password);
    if (!valid) {
      const failed = admin.failedLogins + 1;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLogins: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset lockout on success
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    const tokens = await this.issueTokens(admin.id, admin.tenantId, admin.role, admin.email);
    return { ...tokens, user: { id: admin.id, email: admin.email, role: admin.role } };
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const hash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: stored.adminUserId },
    });
    return this.issueTokens(admin.id, admin.tenantId, admin.role, admin.email);
  }

  async logout(rawToken: string): Promise<void> {
    const hash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    adminId: string,
    tenantId: string,
    role: string,
    email: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: adminId, tenantId, role, email };
    const accessToken = this.jwt.sign(payload);

    const rawRefresh = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { adminUserId: adminId, tokenHash: this.hashToken(rawRefresh), expiresAt },
    });

    return { access_token: accessToken, refresh_token: rawRefresh, expires_in: 900 };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
