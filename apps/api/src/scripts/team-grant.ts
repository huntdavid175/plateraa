import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { PLATFORM_ROLES, type PlatformRole } from '@brixx/shared';
import { account, createDatabase, eq, platformStaff, user, withPlatform } from '@brixx/db';
import { hashSecret } from '../auth/secrets';
import { loadEnv } from '../config/env';
import { VENDOR_LOGIN, vendorLogin } from '../platform/vendor-login';
import { scriptTarget } from './target';

/**
 * Puts someone on Brixx's team: the first Admin, or anyone when the console can't be reached.
 * After that, Admins add people on the admin console's Team page.
 *
 *   pnpm --filter @brixx/api admin:grant <email> ADMIN|SUPPORT ["Their name"]
 *
 * With no login for the email yet, it makes one: give their name, and type the password when
 * asked (it isn't shown). A login that belongs to a business is refused: the team and vendors
 * never share a login. Add --production for the pilot's database.
 */

/** Asks a question on the terminal; with `hidden`, what's typed isn't echoed. */
function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const write = (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text) =>
      write.call(rl, text.startsWith(question) ? question : '');
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

async function main() {
  const env = loadEnv();
  const target = scriptTarget(env);
  const [rawEmail, role, givenName] = target.args.map((arg) => arg.trim());
  const email = rawEmail?.toLowerCase();
  if (!email || !PLATFORM_ROLES.includes(role as PlatformRole)) {
    throw new Error('Say who and as what: admin:grant <email> ADMIN|SUPPORT ["Their name"]');
  }

  console.log(`Working on ${target.label}.`);
  const { db, pool } = createDatabase(target.url, { max: 1 });
  try {
    let [login] = await withPlatform(db, (tx) =>
      tx.select({ id: user.id, name: user.name }).from(user).where(eq(user.email, email)),
    );

    if (login && (await vendorLogin(db, login.id))) throw new Error(VENDOR_LOGIN);

    if (!login) {
      const name = givenName || (await ask(`No login uses ${email} yet. Their name: `)).trim();
      if (name.length < 2) throw new Error('Give their name, at least 2 letters.');
      const password = await ask('Password for the new login (at least 8 characters): ', true);
      if (password.length < 8) throw new Error('The password needs at least 8 characters.');
      if ((await ask('Type it again: ', true)) !== password) {
        throw new Error('The passwords don’t match.');
      }

      // The same rows Better Auth's sign-up makes: the login, and its email-and-password account.
      const id = randomUUID().replace(/-/g, '');
      const hashed = await hashSecret(password);
      await withPlatform(db, async (tx) => {
        await tx.insert(user).values({ id, name, email, emailVerified: false });
        await tx.insert(account).values({
          id: randomUUID().replace(/-/g, ''),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: hashed,
        });
      });
      login = { id, name };
      console.log(`Made a login for ${name}.`);
    }

    const member = login;
    await withPlatform(db, (tx) =>
      tx
        .insert(platformStaff)
        .values({ userId: member.id, role: role as PlatformRole })
        .onConflictDoUpdate({
          target: platformStaff.userId,
          set: { role: role as PlatformRole, active: true },
        }),
    );
    console.log(
      `${member.name} is on the Brixx team as ${role === 'ADMIN' ? 'an Admin' : 'Customer service'}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
