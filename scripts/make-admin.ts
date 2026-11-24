/**
 * Grant SUPER_ADMIN to a user by email.
 * Usage: npx tsx scripts/make-admin.ts your@email.com
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx scripts/make-admin.ts your@email.com");
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  await prisma.platformAdmin.upsert({
    where: { userId: user.id },
    update: { role: "SUPER_ADMIN", revokedAt: null },
    create: { userId: user.id, role: "SUPER_ADMIN" },
  });

  console.log(`✓ ${email} is now a SUPER_ADMIN. Go to http://localhost:3000/admin`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
