/**
 * Grant or revoke a platform-admin role for an existing user.
 *
 *   npx tsx scripts/grant-platform-admin.ts grant you@example.com SUPER_ADMIN
 *   npx tsx scripts/grant-platform-admin.ts revoke you@example.com
 *
 * The user must already have signed up (so a users row exists). Roles:
 * SUPER_ADMIN (everything), FINANCE (payment review), SUPPORT (read-only
 * business list + audit log). The change is written to the platform audit log.
 */
import { PrismaClient, type PlatformAdminRole } from "@prisma/client";

const prisma = new PrismaClient();
const ROLES: readonly PlatformAdminRole[] = ["SUPER_ADMIN", "FINANCE", "SUPPORT"];

async function main() {
  const [action, email, roleArg] = process.argv.slice(2);
  if ((action !== "grant" && action !== "revoke") || !email) {
    throw new Error("Usage: grant-platform-admin.ts <grant|revoke> <email> [ROLE]");
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. They must sign up first.`);

  if (action === "grant") {
    const role = ROLES.find((r) => r === roleArg);
    if (!role) throw new Error(`Role must be one of: ${ROLES.join(", ")}`);
    await prisma.$transaction([
      prisma.platformAdmin.upsert({
        where: { userId: user.id },
        create: { userId: user.id, role },
        update: { role, revokedAt: null },
      }),
      prisma.platformAuditLog.create({
        data: { actorUserId: user.id, action: "ADMIN_GRANTED", targetType: "User", targetId: user.id, metadata: { role, via: "cli" } },
      }),
    ]);
    process.stdout.write(`Granted ${role} to ${email}\n`);
  } else {
    await prisma.$transaction([
      prisma.platformAdmin.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } }),
      prisma.platformAuditLog.create({
        data: { actorUserId: user.id, action: "ADMIN_REVOKED", targetType: "User", targetId: user.id, metadata: { via: "cli" } },
      }),
    ]);
    process.stdout.write(`Revoked platform access for ${email}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
