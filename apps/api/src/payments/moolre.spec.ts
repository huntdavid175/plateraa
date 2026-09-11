import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import { MoolreError, MoolreHttpClient, linkMessage, localNumber, moolreAmount } from './moolre';

const account = {
  apiUser: 'mama-kitchen',
  publicKey: 'pk_test',
  accountNumber: '100000100002',
  email: 'owner@example.com',
};

/** A pretend Moolre answering one request, and what was sent to it. */
function fakeFetch(answer: { status?: number; body?: unknown } | 'down') {
  const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] =
    [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    if (answer === 'down') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, sent };
}

const client = (fetchFn: typeof fetch, sms = true) =>
  new MoolreHttpClient(
    {
      baseUrl: 'https://sandbox.moolre.com',
      ...(sms ? { smsVasKey: 'vas', smsSenderId: 'Plateraa' } : {}),
    },
    fetchFn,
  );

const link = { reference: '01J0LINK', amount: pesewas(4500), callbackUrl: 'https://api/cb' };

describe('Moolre payment links', () => {
  it('asks for a one-off link in the vendor’s own account, and returns its address', async () => {
    const { fetchFn, sent } = fakeFetch({
      body: {
        status: 1,
        code: 'POS09',
        message: 'POS payment link successfully generated.',
        data: { authorization_url: 'https://pos.moolre.com/abc', reference: 'uuid-1' },
      },
    });
    const created = await client(fetchFn).createLink(account, { ...link, expiresInMinutes: 60 });

    expect(created).toEqual({ url: 'https://pos.moolre.com/abc', reference: 'uuid-1' });
    expect(sent[0]!.url).toBe('https://sandbox.moolre.com/embed/link');
    expect(sent[0]!.headers).toMatchObject({
      'X-API-USER': 'mama-kitchen',
      'X-API-PUBKEY': 'pk_test',
    });
    expect(sent[0]!.body).toEqual({
      type: 1,
      amount: '45.00',
      email: 'owner@example.com',
      externalref: '01J0LINK',
      callback: 'https://api/cb',
      reusable: '0',
      expiration_time: 60,
      currency: 'GHS',
      accountnumber: '100000100002',
    });
  });

  it('treats a duplicate reference as final, and an outage or a busy Moolre as worth retrying', async () => {
    const duplicate = fakeFetch({
      status: 400,
      body: { status: 0, code: 'INP02', message: 'Transaction already exits!', data: [] },
    });
    await expect(
      client(duplicate.fetchFn).createLink(account, { ...link, expiresInMinutes: 60 }),
    ).rejects.toMatchObject({ code: 'INP02', retryable: false });

    const down = fakeFetch('down');
    await expect(
      client(down.fetchFn).createLink(account, { ...link, expiresInMinutes: 60 }),
    ).rejects.toMatchObject({ code: 'UNREACHABLE', retryable: true });

    const busy = fakeFetch({ status: 503, body: 'Service Unavailable' });
    await expect(
      client(busy.fetchFn).createLink(account, { ...link, expiresInMinutes: 60 }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('reads a payment’s status: 1 is paid, 0 pending, 2 failed', async () => {
    const paid = fakeFetch({
      body: {
        status: 1,
        code: 'SS01',
        data: { txstatus: 1, amount: '45', transactionid: 31772290, externalref: '01J0LINK' },
      },
    });
    expect(await client(paid.fetchFn).paymentStatus(account, '01J0LINK')).toEqual({
      state: 'PAID',
      amount: 4500,
      transactionId: '31772290',
    });
    expect(paid.sent[0]!.body).toEqual({
      type: 1,
      idtype: 1,
      id: '01J0LINK',
      accountnumber: '100000100002',
    });

    const pending = fakeFetch({ body: { status: 1, data: { txstatus: 0, amount: '45.00' } } });
    expect((await client(pending.fetchFn).paymentStatus(account, 'x'))?.state).toBe('PENDING');

    const unknown = fakeFetch({ body: { status: 0, code: 'TX404', message: 'Not found' } });
    expect(await client(unknown.fetchFn).paymentStatus(account, 'x')).toBeNull();

    const refused = fakeFetch({
      body: { status: 0, code: 'AIN01', message: 'Authentication Error' },
    });
    await expect(client(refused.fetchFn).paymentStatus(account, 'x')).rejects.toBeInstanceOf(
      MoolreError,
    );
  });
});

describe('texting the link', () => {
  it('sends one text from the approved sender name', async () => {
    const { fetchFn, sent } = fakeFetch({ body: { status: 1, code: 'SMS01', data: null } });
    await client(fetchFn).sendSms({ phone: '+233241234567', message: 'Pay here', ref: 'L1' });
    expect(sent[0]!.url).toBe('https://sandbox.moolre.com/open/sms/send');
    expect(sent[0]!.headers).toMatchObject({ 'X-API-VASKEY': 'vas' });
    expect(sent[0]!.body).toEqual({
      type: 1,
      senderid: 'Plateraa',
      messages: [{ recipient: '0241234567', message: 'Pay here', ref: 'L1' }],
    });
  });

  it("says plainly when texting isn't set up", async () => {
    const { fetchFn } = fakeFetch({ body: {} });
    await expect(
      client(fetchFn, false).sendSms({ phone: '+233241234567', message: 'x', ref: 'L1' }),
    ).rejects.toMatchObject({ code: 'SMS_NOT_SET_UP', retryable: false });
  });

  it('fits in one plain text message', () => {
    const message = linkMessage(
      "Auntie Muni's Waakye and Kenkey Joint, East Legon",
      'A15',
      pesewas(123450),
      'https://pos.moolre.com/RZWs1yB6amGjNoiEQvlHPS5uqgp3Jc',
    );
    expect(message).toBe(
      "Auntie Muni's Waakye and Kenke: pay GHS 1234.50 for order A15: https://pos.moolre.com/RZWs1yB6amGjNoiEQvlHPS5uqgp3Jc",
    );
    expect(message.length).toBeLessThanOrEqual(160);
    expect(moolreAmount(pesewas(50))).toBe('0.50');
    expect(localNumber('+233501234567')).toBe('0501234567');
  });
});
