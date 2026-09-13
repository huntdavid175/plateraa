import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ulid } from 'ulid';
import type { TestProject } from 'vitest/node';

/**
 * Before the stress run (vitest.stress.config.mts): the real API, started on this laptop against
 * the Neon `test` branch, with one business per scenario. It's loaded from the API's own compiled
 * `dist` (its test helpers included), compiled here first so the run never tests an old build.
 */

/** A business as the API's test fixtures set it up: an owner, their session and one tablet. */
export interface StressVendor {
  userId: string;
  session: string;
  tenantId: string;
  ownerStaffId: string;
  deviceToken: string;
  deviceId: string;
}

export interface StressSetup {
  baseUrl: string;
  vendors: Record<Scenario, StressVendor>;
}

export const SCENARIOS = ['day', 'lostAnswers', 'killed', 'twice', 'queue', 'chaos'] as const;
export type Scenario = (typeof SCENARIOS)[number];

declare module 'vitest' {
  export interface ProvidedContext {
    /** Null when there's no test database (as in CI): the stress tests skip. */
    stress: StressSetup | null;
  }
}

/** The menu each business gets: no portion counts, so nothing sells out mid-run. */
const MENU = [
  { name: 'Jollof rice', price: 4500, station: 'KITCHEN' },
  { name: 'Waakye', price: 3500, station: 'KITCHEN' },
  { name: 'Sobolo', price: 1000, station: 'DRINKS' },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const apiDir = path.join(root, 'apps/api');

interface NestApp {
  listen(port: number, host: string): Promise<unknown>;
  getHttpServer(): Server;
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

/** The API's database handle; its pool connects as the owner, so it sees every business. */
interface DatabaseHandle {
  pool: { query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }> };
}

/** Every business an earlier, interrupted stress run left behind, as `removeVendors` wants them. */
async function leftovers(app: NestApp, database: unknown): Promise<StressVendor[]> {
  const { pool } = app.get<DatabaseHandle>(database);
  const { rows } = await pool.query<{ tenantId: string; userId: string | null }>(
    `select t.id as "tenantId", s.user_id as "userId"
       from tenants t left join staff_members s on s.tenant_id = t.id and s.user_id is not null
      where t.name like 'Stress %'`,
  );
  return rows.map((row) => ({ tenantId: row.tenantId, userId: row.userId ?? '' }) as StressVendor);
}

interface ApiTestHelpers {
  hasDatabase(): boolean;
  testEnv(): unknown;
  createTestApp(env: unknown): Promise<NestApp>;
}

interface ApiFixtures {
  setUpVendor(server: Server, name: string): Promise<StressVendor>;
  removeVendors(app: NestApp, vendors: StressVendor[]): Promise<void>;
}

/** `tsc -p tsconfig.build.json` in a package, with its own TypeScript. */
function build(dir: string) {
  if (!existsSync(path.join(dir, 'tsconfig.build.json'))) return;
  const tsc = createRequire(path.join(dir, 'package.json')).resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
    cwd: dir,
    stdio: 'inherit',
  });
}

async function addMenu(baseUrl: string, vendor: StressVendor) {
  for (const item of MENU) {
    const res = await fetch(`${baseUrl}/api/menu/items/${ulid()}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${vendor.session}`,
        'x-tenant-id': vendor.tenantId,
      },
      body: JSON.stringify({
        categoryId: null,
        ...item,
        variants: [],
        groups: [],
        channelPrices: {},
      }),
    });
    if (!res.ok) throw new Error(`Adding ${item.name} failed: ${res.status} ${await res.text()}`);
  }
}

export default async function setup(project: TestProject) {
  const api = createRequire(path.join(apiDir, 'package.json'));
  for (const dir of ['packages/shared', 'packages/db', 'packages/api-client', 'apps/api']) {
    build(path.join(root, dir));
  }

  const helpers = api('./dist/test/test-app.js') as ApiTestHelpers;
  if (!helpers.hasDatabase()) {
    console.warn('Stress run skipped: no TEST_DATABASE_URL in the root .env');
    project.provide('stress', null);
    return;
  }
  // The `test` branch gets the latest migrations, as before the API's own tests.
  await (api('./dist/test/global-setup.js') as { default: () => Promise<void> }).default();
  const fixtures = api('./dist/test/fixtures.js') as ApiFixtures;

  const app = await helpers.createTestApp(helpers.testEnv());
  const { DATABASE } = api('./dist/database/database.module.js') as { DATABASE: unknown };
  const stale = await leftovers(app, DATABASE);
  if (stale.length) await fixtures.removeVendors(app, stale);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') throw new Error('The API has no port');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const created: StressVendor[] = [];
  const vendors = {} as Record<Scenario, StressVendor>;
  for (const scenario of SCENARIOS) {
    const vendor = await fixtures.setUpVendor(app.getHttpServer(), `Stress ${scenario}`);
    created.push(vendor);
    await addMenu(baseUrl, vendor);
    vendors[scenario] = vendor;
  }
  project.provide('stress', { baseUrl, vendors });

  return async () => {
    await fixtures.removeVendors(app, created);
    await app.close();
  };
}
