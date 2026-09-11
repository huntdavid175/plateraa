import { formatCedis, parseCedis, type Pesewas } from '@plateraa/shared';

/**
 * Moolre, as the rest of the API sees it (docs.moolre.com): payment links into a vendor's own
 * account, their status, and texting a customer. Behind an interface so tests can use a pretend
 * Moolre.
 */

/** A vendor's own Moolre account, its key decrypted, for one request. */
export interface MoolreAccount {
  apiUser: string;
  publicKey: string;
  accountNumber: string;
  email: string;
}

export type PaymentState = 'PAID' | 'PENDING' | 'FAILED';

export interface PaymentStatus {
  state: PaymentState;
  amount: Pesewas | null;
  transactionId: string | null;
}

export interface MoolreApi {
  createLink(
    account: MoolreAccount,
    input: { reference: string; amount: Pesewas; callbackUrl: string; expiresInMinutes: number },
  ): Promise<{ url: string; reference: string | null }>;
  /** Null when Moolre doesn't know the reference yet: nobody has started paying. */
  paymentStatus(account: MoolreAccount, reference: string): Promise<PaymentStatus | null>;
  sendSms(input: { phone: string; message: string; ref: string }): Promise<void>;
}

export const MOOLRE = Symbol('MOOLRE');

/** Moolre refused, or couldn't be reached. Retryable: worth trying again with the same reference. */
export class MoolreError extends Error {
  override name = 'MoolreError';

  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** An amount as Moolre takes it: "45.00". */
export const moolreAmount = (amount: Pesewas) => formatCedis(amount).replace(/[^\d.]/g, '');

/** "0241234567" from "+233241234567", the way Moolre writes Ghanaian numbers. */
export const localNumber = (phone: string) =>
  phone.startsWith('+233') ? `0${phone.slice(4)}` : phone;

/**
 * The text a customer gets: one SMS part, so plain characters only ("GHS", not "GH₵", which would
 * make it a longer Unicode message), the business, the amount, the order and the link.
 */
export function linkMessage(business: string, orderNumber: string, amount: Pesewas, url: string) {
  return `${business.slice(0, 30).trim()}: pay GHS ${moolreAmount(amount)} for order ${orderNumber}: ${url}`;
}

/** Moolre's callback addresses for payment links (docs: Authentication), one signal among several. */
export const MOOLRE_CALLBACK_IPS = new Set([
  '174.138.44.22',
  '::ffff:174.138.44.22',
  '2604:a880:400:d0::1a77:400',
]);

interface Envelope {
  status?: number | string;
  code?: string;
  message?: string | string[];
  data?: unknown;
}

const STATES: Record<number, PaymentState> = { 0: 'PENDING', 1: 'PAID', 2: 'FAILED' };

const succeeded = (envelope: Envelope) => Number(envelope.status) === 1;

function messageOf(envelope: Envelope): string {
  if (Array.isArray(envelope.message)) return envelope.message.join(' ');
  return envelope.message ?? 'Moolre refused the request';
}

export class MoolreHttpClient implements MoolreApi {
  constructor(
    private readonly config: { baseUrl: string; smsVasKey?: string; smsSenderId?: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async createLink(
    account: MoolreAccount,
    input: { reference: string; amount: Pesewas; callbackUrl: string; expiresInMinutes: number },
  ) {
    const envelope = await this.post('/embed/link', this.accountHeaders(account), {
      type: 1,
      amount: moolreAmount(input.amount),
      email: account.email,
      externalref: input.reference,
      callback: input.callbackUrl,
      reusable: '0',
      expiration_time: input.expiresInMinutes,
      currency: 'GHS',
      accountnumber: account.accountNumber,
    });
    const data = envelope.data as { authorization_url?: unknown; reference?: unknown } | null;
    if (succeeded(envelope) && data && typeof data.authorization_url === 'string') {
      return {
        url: data.authorization_url,
        reference: typeof data.reference === 'string' ? data.reference : null,
      };
    }
    throw new MoolreError(envelope.code ?? 'REFUSED', messageOf(envelope), false);
  }

  async paymentStatus(account: MoolreAccount, reference: string): Promise<PaymentStatus | null> {
    const envelope = await this.post('/open/transact/status', this.accountHeaders(account), {
      type: 1,
      idtype: 1,
      id: reference,
      accountnumber: account.accountNumber,
    });
    if (envelope.code?.startsWith('AIN')) {
      throw new MoolreError(envelope.code, messageOf(envelope), false);
    }
    const data = envelope.data as { txstatus?: unknown; amount?: unknown; transactionid?: unknown };
    if (!succeeded(envelope) || !data || typeof data !== 'object') return null;
    return {
      state: STATES[Number(data.txstatus)] ?? 'PENDING',
      amount: data.amount === undefined ? null : parseCedis(String(data.amount)),
      transactionId:
        data.transactionid === undefined || data.transactionid === null
          ? null
          : String(data.transactionid),
    };
  }

  async sendSms(input: { phone: string; message: string; ref: string }) {
    const { smsVasKey, smsSenderId } = this.config;
    if (!smsVasKey || !smsSenderId) {
      throw new MoolreError(
        'SMS_NOT_SET_UP',
        "Texting payment links isn't set up on the server yet",
        false,
      );
    }
    const envelope = await this.post(
      '/open/sms/send',
      { 'X-API-VASKEY': smsVasKey },
      {
        type: 1,
        senderid: smsSenderId,
        messages: [{ recipient: localNumber(input.phone), message: input.message, ref: input.ref }],
      },
    );
    if (!succeeded(envelope)) {
      throw new MoolreError(envelope.code ?? 'REFUSED', messageOf(envelope), false);
    }
  }

  private accountHeaders(account: MoolreAccount) {
    return { 'X-API-USER': account.apiUser, 'X-API-PUBKEY': account.publicKey };
  }

  private async post(path: string, headers: Record<string, string>, body: object) {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new MoolreError('UNREACHABLE', "Moolre couldn't be reached", true);
    }
    const busy = response.status === 429 || response.status >= 500;
    let envelope: Envelope;
    try {
      envelope = (await response.json()) as Envelope;
    } catch {
      throw new MoolreError(
        `HTTP_${response.status}`,
        `Moolre answered with an error (${response.status})`,
        busy,
      );
    }
    if (busy) {
      throw new MoolreError(envelope.code ?? `HTTP_${response.status}`, messageOf(envelope), true);
    }
    return envelope;
  }
}
