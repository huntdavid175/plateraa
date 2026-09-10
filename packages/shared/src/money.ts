declare const pesewasBrand: unique symbol;

/** An exact amount of money in pesewas (GH₵1 = 100 pesewas). Always a safe integer, never a float. */
export type Pesewas = number & { readonly [pesewasBrand]: true };

export class MoneyError extends Error {
  override name = 'MoneyError';
}

const BPS_PER_WHOLE = 10_000;

export function pesewas(value: number): Pesewas {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Expected a whole number of pesewas, got ${value}`);
  }
  return value as Pesewas;
}

export const ZERO: Pesewas = pesewas(0);

export function add(...amounts: readonly Pesewas[]): Pesewas {
  let total = 0;
  for (const amount of amounts) total += amount;
  return pesewas(total);
}

export function sub(a: Pesewas, b: Pesewas): Pesewas {
  return pesewas(a - b);
}

export function mul(amount: Pesewas, factor: number): Pesewas {
  if (!Number.isSafeInteger(factor)) {
    throw new MoneyError(`Expected a whole-number factor, got ${factor}`);
  }
  return pesewas(amount * factor);
}

export function min(a: Pesewas, b: Pesewas): Pesewas {
  return a <= b ? a : b;
}

/** `amount × bps / 10000`, rounded half-up to the pesewa. Basis points: 100 bps = 1%. */
export function bpsOf(amount: Pesewas, bps: number): Pesewas {
  if (amount < 0) throw new MoneyError(`bpsOf needs a non-negative amount, got ${amount}`);
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_PER_WHOLE) {
    throw new MoneyError(`Basis points must be a whole number from 0 to 10000, got ${bps}`);
  }
  const product = BigInt(amount) * BigInt(bps);
  const quotient = product / BigInt(BPS_PER_WHOLE);
  const remainder = product % BigInt(BPS_PER_WHOLE);
  const rounded = remainder * 2n >= BigInt(BPS_PER_WHOLE) ? quotient + 1n : quotient;
  return pesewas(Number(rounded));
}

export interface FeeSplit {
  gross: Pesewas;
  providerFee: Pesewas;
  platformFee: Pesewas;
  net: Pesewas;
}

/**
 * Splits a collected payment into provider fee, platform fee and vendor net.
 * The three parts always add up to `gross` exactly, and none is ever negative.
 */
export function splitFees(gross: Pesewas, providerBps: number, platformBps: number): FeeSplit {
  if (gross < 0) throw new MoneyError(`Cannot split a negative amount: ${gross}`);
  if (providerBps + platformBps > BPS_PER_WHOLE) {
    throw new MoneyError(`Fees add up to more than 100%: ${providerBps} + ${platformBps} bps`);
  }
  const providerFee = bpsOf(gross, providerBps);
  const platformFee = min(bpsOf(gross, platformBps), sub(gross, providerFee));
  return { gross, providerFee, platformFee, net: sub(gross, add(providerFee, platformFee)) };
}

/** Display only: `1250` → `GH₵12.50`, `123456789` → `GH₵1,234,567.89`. */
export function formatCedis(amount: Pesewas): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const fraction = abs % 100;
  const whole = (abs - fraction) / 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}GH₵${grouped}.${String(fraction).padStart(2, '0')}`;
}

const CEDIS_INPUT = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/**
 * Parses a typed cedi amount ("12.5", "1,200", "GH₵ 5") into pesewas without touching floats.
 * Returns null for anything that isn't a non-negative amount with at most two decimals.
 */
export function parseCedis(input: string): Pesewas | null {
  const cleaned = input
    .trim()
    .replace(/^(?:GH₵|GHS|₵)\s*/i, '')
    .replace(/,/g, '');
  const match = CEDIS_INPUT.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return pesewas(Number(whole) * 100 + Number(fraction));
}
