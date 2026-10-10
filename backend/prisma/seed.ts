// Base data for a fresh database:
//
//     npm run db:seed
//
// Idempotent: safe to run again. It does NOT create demo users or content, and it
// never sets a known password. Later stages add to it (the platform's ledger
// accounts, the first Reach configuration, the music catalogue).
import { bootstrapSuperAdmin } from '../src/admin/bootstrap/bootstrap-admin.js';
import { syncRbac } from '../src/admin/rbac/sync-rbac.js';
import { createStandaloneClient, requireDatabaseUrl } from '../src/database/standalone.js';

const prisma = createStandaloneClient(requireDatabaseUrl());
try {
  await syncRbac(prisma);
  console.log('Permissions and built-in roles are in place.');

  const admins = await prisma.adminUser.count();
  if (admins === 0) {
    // Only in development: the e-mail is a placeholder, and the password is random and shown once.
    if (process.env['NODE_ENV'] === 'production') {
      console.log(
        'No staff accounts exist. Create the first with: npm run admin:create -- --email <address> --name "<name>"',
      );
    } else {
      const created = await bootstrapSuperAdmin(prisma, {
        email: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@blocks.local',
        name: process.env['SEED_ADMIN_NAME'] ?? 'Local Administrator',
      });
      console.log(`Created development super admin ${created.email}`);
      console.log(`  Temporary password: ${created.temporaryPassword}   (shown once)`);
      console.log(
        '  Sign in to the admin console, choose a new password, and set up an authenticator app.',
      );
    }
  } else {
    console.log(`${admins} staff account(s) already exist; none created.`);
  }
} finally {
  await prisma.$disconnect();
}
