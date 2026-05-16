import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      id: DEFAULT_TENANT_ID,
      name: 'Default',
      slug: 'default',
      status: 'active',
    },
  });

  const passwordHash = await argon2.hash('changeme123', {
    type: argon2.argon2id,
    memoryCost: 65536,
  });

  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@localhost' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@localhost',
      passwordHash,
      role: 'owner',
      isActive: true,
    },
  });

  process.stdout.write(
    `Seed complete\n  tenant: ${tenant.slug} (${tenant.id})\n  admin:  ${admin.email} / changeme123\n`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    process.stderr.write(String(e) + '\n');
    await prisma.$disconnect();
    process.exit(1);
  });
