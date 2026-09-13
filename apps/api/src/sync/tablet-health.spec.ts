import type { NestExpressApplication } from '@nestjs/platform-express';
import { devices, eq, withTenant, type Database } from '@plateraa/db';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';
import { STUCK_PUSHES, outboxReport, tabletAlerts } from './tablet-health';

const now = new Date('2026-09-17T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
/** A tablet that's keeping up. */
const keepingUp = {
  signedOut: false,
  drawerOpen: true,
  lastSeenAt: minutesAgo(1),
  pendingChanges: 0,
  oldestPendingAt: null,
  lastSyncedAt: minutesAgo(1),
  pushesSinceSync: 0,
  refused: 0,
};

describe('what the owner is told about a tablet', () => {
  it('says nothing about a tablet that is keeping up', () => {
    expect(tabletAlerts(keepingUp, now)).toEqual([]);
  });

  it('warns when a tablet with its drawer open has been out of touch for 15 minutes', () => {
    expect(tabletAlerts({ ...keepingUp, lastSeenAt: minutesAgo(20) }, now)).toEqual([
      { kind: 'OUT_OF_TOUCH', count: 0, since: minutesAgo(20).toISOString() },
    ]);
    expect(tabletAlerts({ ...keepingUp, lastSeenAt: minutesAgo(10) }, now)).toEqual([]);
    // A closed drawer means the shop isn't trading: a quiet tablet is normal.
    expect(
      tabletAlerts({ ...keepingUp, drawerOpen: false, lastSeenAt: minutesAgo(300) }, now),
    ).toEqual([]);
  });

  it('warns about changes waiting to upload for over 10 minutes', () => {
    const waiting = { ...keepingUp, pendingChanges: 4, oldestPendingAt: minutesAgo(12) };
    expect(tabletAlerts(waiting, now)).toEqual([
      { kind: 'WAITING', count: 4, since: minutesAgo(12).toISOString() },
    ]);
    expect(tabletAlerts({ ...waiting, oldestPendingAt: minutesAgo(5) }, now)).toEqual([]);
  });

  it('says it is stuck when it keeps uploading without finishing a sync', () => {
    const stuck = {
      ...keepingUp,
      pendingChanges: 3,
      oldestPendingAt: minutesAgo(40),
      lastSyncedAt: minutesAgo(45),
      pushesSinceSync: STUCK_PUSHES,
    };
    expect(tabletAlerts(stuck, now)).toEqual([
      { kind: 'STUCK', count: 3, since: minutesAgo(45).toISOString() },
    ]);
  });

  it('counts changes the server refused, and says nothing about a signed-out tablet', () => {
    expect(tabletAlerts({ ...keepingUp, refused: 2 }, now)).toEqual([
      { kind: 'REFUSED', count: 2, since: null },
    ]);
    expect(
      tabletAlerts({ ...keepingUp, signedOut: true, refused: 2, lastSeenAt: null }, now),
    ).toEqual([]);
  });

  it('reads the headers, and ignores ones it can’t read', () => {
    expect(outboxReport('3', '2026-09-17T11:00:00.000Z')).toEqual({
      pending: 3,
      oldestAt: new Date('2026-09-17T11:00:00.000Z'),
    });
    expect(outboxReport('0', undefined)).toEqual({ pending: 0, oldestAt: null });
    expect(outboxReport(undefined, undefined)).toBeNull();
    expect(outboxReport('lots', undefined)).toBeNull();
    expect(outboxReport('2', 'yesterday')).toBeNull();
  });
});

describe.skipIf(!hasDatabase())('tablet health on the dashboard (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let sync: ReturnType<typeof syncClient>;

  const server = () => app.getHttpServer();
  const tablet = async () =>
    (
      await request(server())
        .get('/api/devices')
        .set('Authorization', `Bearer ${vendor.session}`)
        .set('x-tenant-id', vendor.tenantId)
        .expect(200)
    ).body[0];
  const push = (commands: unknown[], pending: string, oldest?: string) => {
    const req = request(server())
      .post('/api/sync/push')
      .set('x-device-token', vendor.deviceToken)
      .set('x-outbox-pending', pending);
    return (oldest ? req.set('x-outbox-oldest', oldest) : req).send({ commands }).expect(200);
  };

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server(), 'Kwesi');
    sync = syncClient(server(), vendor);
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('keeps what a tablet says is waiting, warns after 10 minutes, and clears on a finished sync', async () => {
    const oldest = new Date(Date.now() - 12 * 60_000).toISOString();
    const customer = sync.command('customer.upsert', {
      customerId: ulid(),
      phone: '024 555 0101',
      name: 'Esi',
    });
    await push([customer], '3', oldest);
    expect(await tablet()).toMatchObject({
      pendingChanges: 3,
      oldestPendingAt: oldest,
      alerts: [{ kind: 'WAITING', count: 3, since: oldest }],
    });

    await request(server())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .set('x-outbox-pending', '0')
      .expect(200);
    const after = await tablet();
    expect(after).toMatchObject({ pendingChanges: 0, oldestPendingAt: null, alerts: [] });
    expect(after.lastSyncedAt).not.toBeNull();
  });

  it('says it is stuck when uploads keep coming but no sync finishes', async () => {
    const oldest = new Date(Date.now() - 40 * 60_000).toISOString();
    // The same command again and again: the server answers from what it stored.
    const again = sync.command('customer.upsert', {
      customerId: ulid(),
      phone: '024 555 0102',
    });
    for (let i = 0; i < STUCK_PUSHES; i++) await push([again], '5', oldest);
    expect((await tablet()).alerts).toEqual([expect.objectContaining({ kind: 'STUCK', count: 5 })]);
  });

  it('warns about a tablet with its drawer open that has gone quiet, and about refused changes', async () => {
    await push(
      [
        sync.command('shift.open', { shiftId: ulid(), float: 5000 }),
        sync.command('order.cancel', { orderId: ulid(), reason: 'No such order' }),
      ],
      '0',
    );
    const quiet = new Date(Date.now() - 20 * 60_000);
    await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .update(devices)
        .set({ lastSeenAt: quiet, pushesSinceSync: 0 })
        .where(eq(devices.id, vendor.deviceId)),
    );
    expect((await tablet()).alerts).toEqual([
      { kind: 'OUT_OF_TOUCH', count: 0, since: quiet.toISOString() },
      { kind: 'REFUSED', count: 1, since: null },
    ]);
  });
});
