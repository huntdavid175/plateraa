import { PLATFORM_ROLES, type PlatformRole } from '@brixx/shared';
import { createDatabase, eq, platformStaff, user, withPlatform } from '@brixx/db';
import { loadEnv } from '../config/env';
import { scriptTarget } from './target';

/**
 * Puts a login on Brixx's team, for the first Admin; after that, Admins add people on the admin
 * console's Team page. The login must exist already (sign up on the dashboard first).
 *
 *   pnpm --filter @brixx/api admin:grant <email> ADMIN|SUPPORT
 *
 * Add --production for the pilot's database.
 */
async function main() {
  const env = loadEnv();
  const target = scriptTarget(env);
  const [email, role] = target.args.map((arg) => arg.trim());
  if (!email || !PLATFORM_ROLES.includes(role as PlatformRole)) {
    throw new Error('Say who and as what: admin:grant <email> ADMIN|SUPPORT');
  }

  console.log(`Working on ${target.label}.`);
  const { db, pool } = createDatabase(target.url, { max: 1 });
  try {
    await withPlatform(db, async (tx) => {
      const [login] = await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(eq(user.email, email.toLowerCase()));
      if (!login) throw new Error(`No Brixx login uses ${email}. Sign up on the dashboard first.`);
      await tx
        .insert(platformStaff)
        .values({ userId: login.id, role: role as PlatformRole })
        .onConflictDoUpdate({
          target: platformStaff.userId,
          set: { role: role as PlatformRole, active: true },
        });
      console.log(
        `${login.name} is on the Brixx team as ${role === 'ADMIN' ? 'an Admin' : 'Customer service'}.`,
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
