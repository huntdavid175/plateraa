import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ulid } from 'ulid';
import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  Till,
  drain,
  expectInStep,
  killAll,
  openTablet,
  seededRandom,
  serverDay,
  trouble,
  type Tablet,
} from './testing/stress-tablet';

/**
 * The offline stress run (plan.md Phase 4; `pnpm --filter @plateraa/mobile stress`). The tablet's
 * real sync engine, with SQLite in a file, sells against the real API on the Neon `test` branch
 * over a connection that keeps failing. However rough it gets, every order must reach the server
 * exactly once, the tablet must end up showing what the server has, and the day summary must
 * match the hand tally.
 */

const setup = inject('stress');
const ORDERS = Number(process.env.STRESS_ORDERS ?? 100);
const SEED = Number(process.env.STRESS_SEED ?? 20260917);

const files: string[] = [];
function tabletFile(): string {
  const file = path.join(os.tmpdir(), `plateraa-stress-${ulid()}.db`);
  files.push(file);
  return file;
}

afterAll(() => {
  killAll();
  for (const file of files) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(`${file}${suffix}`, { force: true });
      } catch {
        // Only a temp file: if Windows still holds it, it goes with the next temp clean-up.
      }
    }
  }
});

/** A tablet that has done its first sync, with its till's drawer open. */
async function readyTablet(
  scenario: keyof NonNullable<typeof setup>['vendors'],
  file = tabletFile(),
) {
  const tablet = await openTablet(setup!, setup!.vendors[scenario], file);
  await drain(tablet);
  const till = new Till(tablet, seededRandom(SEED));
  await till.loadMenu();
  return { tablet, till, file };
}

// Each scenario has its own business, tablet and SQLite file, so they run side by side.
describe.skipIf(!setup).concurrent('the tablet against the real API, on a bad connection', () => {
  it(`sells ${ORDERS} orders with an hour in airplane mode, and every order arrives once`, async () => {
    const vendor = setup!.vendors.day;
    const { tablet, till } = await readyTablet('day');
    await till.openDrawer();

    const third = Math.round(ORDERS / 3);
    for (let i = 0; i < ORDERS; i++) {
      tablet.network.offline = i >= third && i < 2 * third; // The middle third: airplane mode.
      await till.sell();
      if (i % 5 === 4) await tablet.engine.syncNow(); // The engine's timer, now and then.
    }
    tablet.network.offline = false;
    await till.closeDrawer();
    await drain(tablet);

    console.info(`Airplane mode: ${trouble(tablet.network, till)}`);
    expect(tablet.network.stats.offline).toBeGreaterThan(0);
    await expectInStep(setup!, vendor, tablet, till);
    // The drawer was counted at exactly what should be in it.
    const { drawerCloses } = await serverDay(setup!, vendor);
    expect(drawerCloses).toEqual([
      expect.objectContaining({
        counted: till.float + till.cash,
        expected: till.float + till.cash,
        variance: 0,
      }),
    ]);
  });

  it('never applies an upload twice when the server’s answers are lost', async () => {
    const { tablet, till } = await readyTablet('lostAnswers');
    await till.openDrawer();
    tablet.network.lostAnswers = 1000; // Every upload reaches the server; no answer comes back.
    for (let i = 0; i < 20; i++) {
      await till.sell();
      if (i % 5 === 4) await tablet.engine.syncNow();
    }
    expect(tablet.engine.getState().pending).toBeGreaterThan(0);
    tablet.network.lostAnswers = 0;
    await drain(tablet);

    console.info(`Lost answers: ${trouble(tablet.network, till)}`);
    expect(tablet.network.stats.lostAnswers).toBeGreaterThanOrEqual(4);
    await expectInStep(setup!, setup!.vendors.lostAnswers, tablet, till);
  });

  it('picks up where it left off after the app is killed mid-sync, and again before syncing', async () => {
    const vendor = setup!.vendors.killed;
    const first = await readyTablet('killed');
    let tablet: Tablet = first.tablet;
    const { till, file } = first;
    await till.openDrawer();

    tablet.network.offline = true;
    for (let i = 0; i < 15; i++) await till.sell();
    // Back online: the first upload reaches the server, and the app dies before saving the answer.
    tablet.network.offline = false;
    tablet.network.lostAnswers = 1;
    await tablet.engine.syncNow();
    const stranded = tablet.engine.getState().pending;
    tablet.kill();

    tablet = await openTablet(setup!, vendor, file);
    till.use(tablet);
    expect(tablet.engine.getState().pending).toBe(stranded);

    // More sales offline, then killed again before anything goes up.
    tablet.network.offline = true;
    for (let i = 0; i < 10; i++) await till.sell();
    const waiting = tablet.engine.getState().pending;
    tablet.kill();

    tablet = await openTablet(setup!, vendor, file);
    till.use(tablet);
    expect(tablet.engine.getState().pending).toBe(waiting);
    await drain(tablet);

    console.info(`Killed twice: ${trouble(tablet.network, till)}`);
    await expectInStep(setup!, vendor, tablet, till);
  });

  it('gives the same answers when every upload arrives twice, and when the whole day is sent again', async () => {
    const vendor = setup!.vendors.twice;
    const { tablet, till } = await readyTablet('twice');
    await till.openDrawer();
    tablet.network.twice = true;
    for (let i = 0; i < 20; i++) {
      await till.sell();
      if (i % 4 === 3) await tablet.engine.syncNow();
    }
    tablet.network.twice = false;
    await drain(tablet);
    console.info(`Doubled: ${trouble(tablet.network, till)}`);
    expect(tablet.network.stats.twice).toBeGreaterThan(0);
    await expectInStep(setup!, vendor, tablet, till);

    // A confused tablet sends every upload of the day again: same answers, nothing changes.
    const before = await serverDay(setup!, vendor);
    for (const { commands, answers } of tablet.network.delivered) {
      await tablet.network.resend(commands, answers);
    }
    expect(tablet.network.mismatches).toEqual([]);
    expect(await serverDay(setup!, vendor)).toEqual(before);
  });

  it('sends 200 changes queued offline 50 at a time, oldest first, and they all arrive', async () => {
    const { tablet, till } = await readyTablet('queue');
    tablet.network.offline = true;
    await till.openDrawer();
    while (till.commands < 200) await till.sell();
    expect(tablet.engine.getState().pending).toBe(till.commands);

    tablet.network.offline = false;
    await drain(tablet);
    console.info(`Queued: ${trouble(tablet.network, till)}`);
    const sizes = Array.from({ length: Math.ceil(till.commands / 50) }, (_, i) =>
      Math.min(50, till.commands - i * 50),
    );
    expect(tablet.network.stats.batchSizes).toEqual(sizes);
    await expectInStep(setup!, setup!.vendors.queue, tablet, till);
  });

  it('ends in step after a day of random trouble, with the app restarted twice', async () => {
    const vendor = setup!.vendors.chaos;
    const random = seededRandom(SEED);
    const chaos = { offline: 0.25, lostAnswer: 0.15, twice: 0.1 };
    const first = await readyTablet('chaos');
    let tablet: Tablet = first.tablet;
    const { till, file } = first;
    tablet.network.chaos = chaos;
    await till.openDrawer();

    const totals = { offline: 0, lostAnswers: 0, twice: 0 };
    const remember = () => {
      totals.offline += tablet.network.stats.offline;
      totals.lostAnswers += tablet.network.stats.lostAnswers;
      totals.twice += tablet.network.stats.twice;
    };
    for (let i = 0; i < 40; i++) {
      await till.sell();
      if (random() < 0.3) await tablet.engine.syncNow();
      if (i === 13 || i === 27) {
        remember();
        tablet.kill();
        tablet = await openTablet(setup!, vendor, file, { chaos, random });
        till.use(tablet);
      }
    }
    tablet.network.chaos = null;
    await till.closeDrawer();
    await drain(tablet);
    remember();

    console.info(
      `Random trouble (seed ${SEED}): ${till.orders.size} orders, ${till.commands} changes; ${totals.offline} tries offline, ${totals.lostAnswers} answers lost, ${totals.twice} uploads doubled`,
    );
    expect(totals.offline + totals.lostAnswers + totals.twice).toBeGreaterThan(0);
    await expectInStep(setup!, vendor, tablet, till);
    const { drawerCloses } = await serverDay(setup!, vendor);
    expect(drawerCloses).toEqual([expect.objectContaining({ variance: 0 })]);
  });
});
