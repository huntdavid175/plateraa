import { ulid } from 'ulid';
import { loadEnv } from '../config/env';
import { R2PhotoStore } from '../photos/photo-store';

/**
 * Checks the photo storage (Cloudflare R2) works with the settings in .env: keeps a tiny test
 * file in the bucket, reads it back from the public address, and removes it. Prints no keys.
 *
 *   pnpm --filter @brixx/api photos:check
 */
async function main() {
  const store = new R2PhotoStore(loadEnv());
  if (!store.ready) {
    console.error(
      'Photos aren’t set up: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_URL are all needed.',
    );
    process.exit(1);
  }
  const key = `checks/${ulid()}.txt`;
  await store.put(key, new TextEncoder().encode('brixx photo check'), 'text/plain');
  console.log('1. Keeping a test file in the bucket: ok');
  const response = await fetch(store.urlOf(key));
  console.log(
    response.ok
      ? '2. Reading it from the public address: ok'
      : `2. Reading it from the public address: failed (${response.status}). Check R2_PUBLIC_URL, and that Public access is on for the bucket.`,
  );
  await store.remove(key);
  console.log('3. Removing it: ok');
  process.exit(response.ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`The check failed: ${(error as Error).message}`);
  process.exit(1);
});
