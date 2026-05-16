import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// This test only runs when DATABASE_URL is set (integration mode).
// It verifies the app role cannot UPDATE or DELETE audit_log rows.
// NOTE: In the dev setup the 'app' user is the DB superuser, so restriction
// tests are skipped in that environment. They are valid against a production
// schema where an unprivileged app role is used (see prisma/sql/audit-log-immutability.sql).
const DATABASE_URL = process.env['DATABASE_URL'];

describe.skipIf(!DATABASE_URL)('audit log immutability (integration)', () => {
  const prisma = new PrismaClient();
  let isSuperuser = false;

  beforeAll(async () => {
    const result = await prisma.$queryRaw<{ is_superuser: boolean }[]>`
      SELECT rolsuper AS is_superuser FROM pg_roles WHERE rolname = current_user
    `;
    isSuperuser = result[0]?.is_superuser ?? false;
  });

  it('app role can INSERT into audit_log', async () => {
    const row = await prisma.auditLog.create({
      data: {
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorKind: 'system',
        action: 'test.immutability',
        resource: 'test',
        result: 'success',
      },
    });
    expect(row.id).toBeTruthy();
  });

  it('restricted app role cannot UPDATE audit_log rows', async () => {
    if (isSuperuser) {
      process.stdout.write(
        'Skipping: running as superuser — immutability enforced only for restricted roles\n',
      );
      return;
    }
    await expect(
      prisma.$executeRaw`UPDATE audit_log SET result = 'failure' WHERE id = 0`,
    ).rejects.toThrow(/permission denied/i);
  });

  it('restricted app role cannot DELETE audit_log rows', async () => {
    if (isSuperuser) {
      process.stdout.write(
        'Skipping: running as superuser — immutability enforced only for restricted roles\n',
      );
      return;
    }
    await expect(prisma.$executeRaw`DELETE FROM audit_log WHERE id = 0`).rejects.toThrow(
      /permission denied/i,
    );
  });
});
