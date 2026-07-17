// One-off: proves the signed gym ingest endpoint works end-to-end.
// Generates an Ed25519 keypair, registers an Integration row with the public key,
// signs a member payload, and POSTs it to the running API.
import crypto from 'node:crypto';
import http from 'node:http';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT = '00000000-0000-0000-0000-000000000001';
const PATH = '/api/v1/integrations/gym/members';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

let integration = await prisma.integration.findFirst({ where: { tenantId: TENANT, type: 'gym' } });
if (!integration) {
  integration = await prisma.integration.create({
    data: { tenantId: TENANT, type: 'gym', name: 'Gym (smoke)', verifyKey: pubPem, isActive: true },
  });
} else {
  integration = await prisma.integration.update({
    where: { id: integration.id },
    data: { verifyKey: pubPem, isActive: true },
  });
}
const keyId = integration.id;
console.log('integration:', keyId);

const body = JSON.stringify({
  memberNumber: 'GYM-TEST-001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@gym.test',
  phone: '+12025550100',
  membership: { status: 'active', validFrom: '2026-07-17T00:00:00Z', validTo: '2026-12-31T23:59:59Z', plan: 'premium' },
});
const ts = new Date().toUTCString();
const bodyHash = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
const canonical = `${ts}\nPOST\n${PATH}\n${bodyHash}`;
const sig = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');

function send(extraSig) {
  return new Promise((resolve) => {
    const headers = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      'x-key-id': keyId,
      'x-timestamp': ts,
      'x-signature': extraSig ?? sig,
    };
    const req = http.request({ host: '127.0.0.1', port: 3000, path: PATH, method: 'POST', headers }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d }));
    });
    req.on('error', (e) => resolve({ status: 0, body: String(e) }));
    req.write(body); req.end();
  });
}

const ok = await send();
console.log('VALID SIGNATURE  ->', ok.status, ok.body);

const bad = await send(crypto.randomBytes(64).toString('base64'));
console.log('TAMPERED SIG     ->', bad.status, bad.body);

await prisma.$disconnect();
