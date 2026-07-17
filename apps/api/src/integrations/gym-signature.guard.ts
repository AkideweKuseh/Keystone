import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createPublicKey, verify as edVerify } from 'crypto';
import type { Request as ExpressRequest } from 'express';
import type { Integration } from '@prisma/client';
import { PrismaService } from '@sam/persistence';

/** Express request augmented with the captured raw body + resolved integration. */
export type SignedRequest = ExpressRequest & {
  rawBody?: Buffer;
  integration?: Integration;
};

/** Max allowed clock skew between sender and receiver (replay window). */
const MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * Verifies an Ed25519 request signature sent by the gym:
 *
 *   canonical = `${timestamp}\n${method}\n${path}\n${sha256(bodyHex)}`
 *   signature = ed25519.sign(canonical, GYM_PRIVATE_KEY)
 *
 * Headers: `x-key-id` (Integration id), `x-timestamp` (ISO/RFC date),
 * `x-signature` (base64). Rejects on bad signature, stale timestamp, or
 * unknown key. Asymmetric: only the gym's public key is stored here.
 */
@Injectable()
export class GymSignatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SignedRequest>();
    const keyId = req.headers['x-key-id'];
    const ts = req.headers['x-timestamp'];
    const sigHeader = req.headers['x-signature'];

    if (typeof keyId !== 'string' || typeof ts !== 'string' || typeof sigHeader !== 'string') {
      throw new UnauthorizedException('Missing signature headers');
    }

    const sentAt = Date.parse(ts);
    if (Number.isNaN(sentAt) || Math.abs(Date.now() - sentAt) > MAX_SKEW_MS) {
      throw new UnauthorizedException('Stale or invalid timestamp');
    }

    const integration = await this.prisma.integration.findFirst({
      where: { id: keyId, type: 'gym', isActive: true },
    });
    if (!integration || !integration.verifyKey) {
      throw new UnauthorizedException('Unknown integration key');
    }

    const bodyHash = req.rawBody ? createHash('sha256').update(req.rawBody).digest('hex') : '';
    const canonical = `${ts}\n${req.method}\n${req.path}\n${bodyHash}`;

    let pub;
    try {
      pub = createPublicKey({ key: integration.verifyKey, format: 'pem' });
    } catch {
      throw new UnauthorizedException('Misconfigured integration key');
    }

    let signature: Buffer;
    try {
      signature = Buffer.from(sigHeader, 'base64');
    } catch {
      throw new UnauthorizedException('Bad signature encoding');
    }

    const ok = edVerify(null, Buffer.from(canonical, 'utf8'), pub, signature);
    if (!ok) throw new UnauthorizedException('Invalid signature');

    req.integration = integration;
    return true;
  }
}
