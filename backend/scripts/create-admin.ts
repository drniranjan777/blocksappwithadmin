// Creates a super admin from the command line:
//
//     npm run admin:create -- --email you@company.com --name "Your Name"
//
// This is how the first staff account comes to exist; there is no default
// account. A random temporary password is printed ONCE, here, and nowhere else:
// it expires, and the account must replace it and set up an authenticator app
// before it can do anything. Run it against the right database:
//
//     DATABASE_URL=... npm run admin:create -- --email ... --name ...
import { bootstrapSuperAdmin } from '../src/admin/bootstrap/bootstrap-admin.js';
import { createStandaloneClient, requireDatabaseUrl } from '../src/database/standalone.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('--email');
const name = arg('--name');
if (!email || !name) {
  console.error('Usage: npm run admin:create -- --email <address> --name "<full name>"');
  process.exit(1);
}

const prisma = createStandaloneClient(requireDatabaseUrl());
try {
  const result = await bootstrapSuperAdmin(prisma, { email, name });
  console.log(`Created super admin ${result.email}`);
  console.log(`  Temporary password: ${result.temporaryPassword}`);
  console.log(`  Valid until:        ${result.expiresAt.toUTCString()}`);
  console.log('Give it to the person privately. It is not stored or logged anywhere else.');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
