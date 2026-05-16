import { beforeEach, describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let svc: CryptoService;

  beforeEach(() => {
    process.env['DEVICE_SECRET_KEY'] = 'base64:' + Buffer.alloc(32, 0xab).toString('base64');
    svc = new CryptoService();
  });

  it('round-trips plaintext correctly', () => {
    const plain = 'super-secret-P@ssw0rd!';
    const enc = svc.encrypt(plain);
    expect(svc.decrypt(enc)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a.toString('hex')).not.toBe(b.toString('hex'));
  });

  it('throws if DEVICE_SECRET_KEY is missing', () => {
    delete process.env['DEVICE_SECRET_KEY'];
    expect(() => new CryptoService()).toThrow('DEVICE_SECRET_KEY');
  });

  it('decryption fails if ciphertext is tampered', () => {
    const enc = svc.encrypt('secret');
    enc[15] = enc[15] ^ 0xff; // flip a tag byte
    expect(() => svc.decrypt(enc)).toThrow();
  });
});
