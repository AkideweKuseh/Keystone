import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env['DEVICE_SECRET_KEY'] ?? '';
    if (!raw) throw new Error('DEVICE_SECRET_KEY env var is required');
    this.key = Buffer.from(raw.replace('base64:', ''), 'base64');
    if (this.key.length !== 32) {
      throw new Error('DEVICE_SECRET_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]); // 12 (iv) + 16 (tag) + data
  }

  decrypt(ciphertext: Buffer): string {
    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const data = ciphertext.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  }
}
