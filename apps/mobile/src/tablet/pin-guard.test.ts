import { describe, expect, it } from 'vitest';
import { openLocalDatabase } from '../offline/schema';
import { nodeSqliteDriver } from '../offline/testing/node-sqlite';
import { checkPin, pinMessage } from './pin-guard';

/** Stands in for the native PBKDF2 check: the verifier for PIN 482913 is "v:482913". */
const verify = async (verifier: string, pin: string) => verifier === `v:${pin}`;
const T0 = new Date('2026-09-17T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

async function tablet(verifier: string | null = 'v:482913', active = 1) {
  const db = await openLocalDatabase(nodeSqliteDriver());
  await db.run(
    `INSERT INTO staff (id, display_name, role, active, pin_verifier)
     VALUES ('ama', 'Ama', 'STAFF', ?, ?)`,
    [active, verifier],
  );
  return db;
}

describe('offline PIN check', () => {
  it('unlocks with the right PIN', async () => {
    expect(await checkPin(await tablet(), 'ama', '482913', verify, T0)).toEqual({ ok: true });
  });

  it('makes you wait from the 5th wrong PIN, doubling, and turns the PIN off at the 10th', async () => {
    const db = await tablet();
    for (let tries = 1; tries <= 4; tries++) {
      expect(await checkPin(db, 'ama', '111111', verify, T0)).toEqual({
        ok: false,
        reason: 'wrong',
        triesBeforeWait: 5 - tries,
      });
    }
    expect(await checkPin(db, 'ama', '111111', verify, T0)).toEqual({
      ok: false,
      reason: 'wait',
      seconds: 30,
    });
    // While waiting, even the right PIN is refused.
    expect(await checkPin(db, 'ama', '482913', verify, at(10))).toEqual({
      ok: false,
      reason: 'wait',
      seconds: 20,
    });

    let elapsed = 30;
    for (const seconds of [60, 120, 240, 480]) {
      expect(await checkPin(db, 'ama', '111111', verify, at(elapsed))).toEqual({
        ok: false,
        reason: 'wait',
        seconds,
      });
      elapsed += seconds;
    }
    expect(await checkPin(db, 'ama', '111111', verify, at(elapsed))).toEqual({
      ok: false,
      reason: 'disabled',
    });
    expect(await checkPin(db, 'ama', '482913', verify, at(elapsed + 3600))).toEqual({
      ok: false,
      reason: 'disabled',
    });
  });

  it('starts counting again after the right PIN', async () => {
    const db = await tablet();
    for (let tries = 0; tries < 3; tries++) await checkPin(db, 'ama', '111111', verify, T0);
    await checkPin(db, 'ama', '482913', verify, T0);
    expect(await checkPin(db, 'ama', '111111', verify, T0)).toMatchObject({ triesBeforeWait: 4 });
  });

  it('starts counting again when a manager sets a new PIN', async () => {
    const db = await tablet();
    for (let tries = 0; tries < 10; tries++) {
      await checkPin(db, 'ama', '111111', verify, at(tries * 1000));
    }
    expect(await checkPin(db, 'ama', '482913', verify, at(20_000))).toMatchObject({
      reason: 'disabled',
    });

    await db.run(`UPDATE staff SET pin_verifier = 'v:572913' WHERE id = 'ama'`);
    expect(await checkPin(db, 'ama', '572913', verify, at(20_001))).toEqual({ ok: true });
  });

  it("doesn't unlock for someone switched off or without a PIN", async () => {
    expect(await checkPin(await tablet('v:482913', 0), 'ama', '482913', verify, T0)).toEqual({
      ok: false,
      reason: 'no-pin',
    });
    expect(await checkPin(await tablet(null), 'ama', '482913', verify, T0)).toEqual({
      ok: false,
      reason: 'no-pin',
    });
  });

  it('explains each refusal in plain words', () => {
    expect(pinMessage({ ok: false, reason: 'wrong', triesBeforeWait: 3 })).toBe(
      'Wrong PIN. 3 tries left before a wait.',
    );
    expect(pinMessage({ ok: false, reason: 'wait', seconds: 30 })).toBe(
      'Too many wrong PINs. Try again in 30 seconds.',
    );
    expect(pinMessage({ ok: false, reason: 'wait', seconds: 240 })).toBe(
      'Too many wrong PINs. Try again in 4 minutes.',
    );
  });
});
