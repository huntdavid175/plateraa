import { createDatabase } from '@brixx/db';
import { loadEnv } from '../config/env';
import { approveBusiness, pendingBusinesses } from '../identity/onboarding';
import { scriptTarget } from './target';

/**
 * Businesses that have asked to join, until the admin dashboard exists (24 Oct, user decision).
 *
 *   pnpm --filter @brixx/api admin:requests                       list the waiting requests
 *   pnpm --filter @brixx/api admin:approve "<business name or slug>"   let one in
 *
 * Add --production for the pilot's database.
 */
async function main() {
  const env = loadEnv();
  const target = scriptTarget(env);
  const [command, wanted] = target.args.map((arg) => arg.trim());
  if (command !== 'list' && command !== 'approve') {
    throw new Error('Say list, or approve "<business name or slug>"');
  }

  console.log(`Working on ${target.label}.`);
  const { db, pool } = createDatabase(target.url, { max: 1 });
  try {
    const waiting = await pendingBusinesses(db);
    if (command === 'list') {
      if (!waiting.length) {
        console.log('No requests are waiting.');
        return;
      }
      for (const request of waiting) {
        console.log(
          [
            `${request.name} (${request.slug})`,
            `  ${request.vendorType} in ${request.area ?? '?'}, phone ${request.contactPhone ?? '?'}`,
            `  takes orders by ${(request.orderWays ?? []).join(', ') || '?'}`,
            `  asked ${request.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
          ].join('\n'),
        );
      }
      return;
    }

    if (!wanted) throw new Error('Say which business: admin:approve "<business name or slug>"');
    const matches = waiting.filter((request) => request.slug === wanted || request.name === wanted);
    if (!matches.length) throw new Error(`No waiting request is called "${wanted}"`);
    if (matches.length > 1) {
      throw new Error(
        `${matches.length} requests are called "${wanted}". Use one of these slugs: ${matches.map((m) => m.slug).join(', ')}`,
      );
    }
    const request = matches[0]!;
    await approveBusiness(db, request.tenantId);
    console.log(`${request.name} is approved. Their dashboard opens the next time they sign in.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
