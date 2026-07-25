import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'crypto';

// Outbound Ed25519 signing. Keystone's private key lives in env (never in DB);
// the derived public key is handed to the gym out-of-band so it can verify.

let cached: KeyObject | null | undefined;

function privateKey(): KeyObject | null {
  if (cached !== undefined) return cached;
  const b64 = process.env['INTEGRATION_SIGNING_PRIVATE_KEY'];
  if (!b64) {
    cached = null;
    return null;
  }
  try {
    cached = createPrivateKey({
      key: Buffer.from(b64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    cached = null;
  }
  return cached;
}

export function signingConfigured(): boolean {
  return privateKey() !== null;
}

export function signingKid(): string {
  return process.env['INTEGRATION_SIGNING_KID'] ?? 'keystone-1';
}

/** Public key (SPKI PEM) for the gym to verify with — derived from the private key. */
export function getPublicKeyPem(): string | null {
  const key = privateKey();
  if (!key) return null;
  return createPublicKey(key).export({ type: 'spki', format: 'pem' }) as string;
}

/**
 * Signs an outbound webhook body. Canonical = `${timestamp}\n${sha256(body)}`;
 * signature = ed25519.sign(canonical, KEYSTONE_PRIVATE_KEY).
 */
export function signOutbound(body: string): {
  timestamp: string;
  signature: string;
  kid: string;
} {
  const key = privateKey();
  const timestamp = new Date().toUTCString();
  const bodyHash = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
  const canonical = `${timestamp}\n${bodyHash}`;
  const signature = key ? sign(null, Buffer.from(canonical, 'utf8'), key).toString('base64') : '';
  return { timestamp, signature, kid: signingKid() };
}
