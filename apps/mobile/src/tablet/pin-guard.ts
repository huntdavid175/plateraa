import { PIN_ATTEMPTS_BEFORE_LOCK, pinLockout } from '@plateraa/shared';
import type { Sql } from '../offline/sql';

/**
 * The offline PIN check. The tablet holds each person's PIN verifier (never the PIN) and applies
 * the server's lockout rule itself: from the 5th wrong PIN a wait of 30 s that doubles each time,
 * and at the 10th the PIN is disabled until a manager sets a new one. The count is kept in the
 * database, so restarting the app doesn't reset it.
 */

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: 'wrong'; triesBeforeWait: number }
  | { ok: false; reason: 'wait'; seconds: number }
  | { ok: false; reason: 'disabled' }
  | { ok: false; reason: 'no-pin' };

export type VerifyPin = (verifier: string, pin: string) => Promise<boolean>;

interface Attempts {
  verifier: string;
  failures: number;
  locked_until: string | null;
}

export async function checkPin(
  db: Sql,
  staffId: string,
  pin: string,
  verify: VerifyPin,
  now: Date = new Date(),
): Promise<PinCheck> {
  const staff = await db.get<{ pin_verifier: string | null; active: number | null }>(
    'SELECT pin_verifier, active FROM staff WHERE id = ?',
    [staffId],
  );
  if (!staff?.pin_verifier || staff.active !== 1) return { ok: false, reason: 'no-pin' };
  const verifier = staff.pin_verifier;

  let attempts = await db.get<Attempts>(
    'SELECT verifier, failures, locked_until FROM pin_attempts WHERE staff_id = ?',
    [staffId],
  );
  // A manager set a new PIN: the count starts again, as it does on the server.
  if (attempts && attempts.verifier !== verifier) {
    await db.run('DELETE FROM pin_attempts WHERE staff_id = ?', [staffId]);
    attempts = undefined;
  }
  const failures = attempts?.failures ?? 0;
  if (pinLockout(failures).disabled) return { ok: false, reason: 'disabled' };
  if (attempts?.locked_until) {
    const waitMs = new Date(attempts.locked_until).getTime() - now.getTime();
    if (waitMs > 0) return { ok: false, reason: 'wait', seconds: Math.ceil(waitMs / 1000) };
  }

  if (await verify(verifier, pin)) {
    if (attempts) await db.run('DELETE FROM pin_attempts WHERE staff_id = ?', [staffId]);
    return { ok: true };
  }

  const count = failures + 1;
  const lockout = pinLockout(count);
  await db.run(
    `INSERT OR REPLACE INTO pin_attempts (staff_id, verifier, failures, locked_until)
     VALUES (?, ?, ?, ?)`,
    [
      staffId,
      verifier,
      count,
      lockout.lockSeconds
        ? new Date(now.getTime() + lockout.lockSeconds * 1000).toISOString()
        : null,
    ],
  );
  if (lockout.disabled) return { ok: false, reason: 'disabled' };
  if (lockout.lockSeconds) return { ok: false, reason: 'wait', seconds: lockout.lockSeconds };
  return { ok: false, reason: 'wrong', triesBeforeWait: PIN_ATTEMPTS_BEFORE_LOCK - count };
}

function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** What the lock screen says when a PIN didn't unlock the tablet. */
export function pinMessage(check: Exclude<PinCheck, { ok: true }>): string {
  switch (check.reason) {
    case 'wrong':
      return check.triesBeforeWait === 1
        ? 'Wrong PIN. One more wrong try and you will have to wait.'
        : `Wrong PIN. ${check.triesBeforeWait} tries left before a wait.`;
    case 'wait':
      return `Too many wrong PINs. Try again in ${waitText(check.seconds)}.`;
    case 'disabled':
      return 'This PIN is off after 10 wrong tries. Ask a manager to set a new one.';
    case 'no-pin':
      return 'This person has no PIN yet. A manager can set one.';
  }
}
