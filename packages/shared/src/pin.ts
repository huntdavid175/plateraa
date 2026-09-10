export const PIN_LENGTH = 6;

export const PIN_ATTEMPTS_BEFORE_LOCK = 5;
export const PIN_ATTEMPTS_BEFORE_DISABLE = 10;
const PIN_BASE_LOCK_SECONDS = 30;

/**
 * What happens after `failedAttempts` wrong PINs in a row: from the 5th a wait that starts at
 * 30 s and doubles each time, and at the 10th the PIN is disabled until a manager resets it.
 * The phone applies the same rule offline; the server applies it online.
 */
export function pinLockout(failedAttempts: number): { lockSeconds: number; disabled: boolean } {
  if (failedAttempts >= PIN_ATTEMPTS_BEFORE_DISABLE) return { lockSeconds: 0, disabled: true };
  if (failedAttempts < PIN_ATTEMPTS_BEFORE_LOCK) return { lockSeconds: 0, disabled: false };
  return {
    lockSeconds: PIN_BASE_LOCK_SECONDS * 2 ** (failedAttempts - PIN_ATTEMPTS_BEFORE_LOCK),
    disabled: false,
  };
}

/** Keypad shapes and patterns people reach for; a coworker watching would guess them first. */
const COMMON_PINS = new Set([
  '112233',
  '102030',
  '147258',
  '258369',
  '159753',
  '147852',
  '963852',
  '789456',
  '456123',
  '696969',
]);

/**
 * Why a PIN is refused, or null if it's acceptable. Used by the phone when a PIN is set
 * and enforced again by the server.
 */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'PIN must be exactly 6 digits';
  if (/^(\d)\1{5}$/.test(pin)) return "PIN can't be one digit repeated";

  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((digit, i) => digit - digits[i]!);
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) {
    return "PIN can't be a run like 123456";
  }
  if (/^(\d\d)\1\1$/.test(pin)) return "PIN can't be a repeated pair like 121212";
  if (/^(\d{3})\1$/.test(pin)) return "PIN can't be a repeated triple like 123123";
  if (/^(19|20)\d{4}$/.test(pin)) return "PIN can't start with a year like 1998 or 2004";
  if (COMMON_PINS.has(pin)) return 'That PIN is too easy to guess';
  return null;
}
