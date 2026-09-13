'use server';

import { OFFLINE, api, messageOf, type PlaceOrderBody, type TrackedOrder } from '../lib/api';

/**
 * What the customer's browser asks the storefront's server to do. Each passes the request on to
 * the public API and answers with the result, or with words saying what went wrong: nothing is
 * thrown, so the page can show the message.
 */
type Failed = { ok: false; message: string };

export async function placeOrder(
  slug: string,
  body: PlaceOrderBody,
): Promise<
  | { ok: true; token: string; number: string; payUrl: string | null; payProblem: string | null }
  | Failed
> {
  try {
    const { data, error, response } = await api.POST('/api/public/stores/{slug}/orders', {
      params: { path: { slug } },
      body,
    });
    if (!data) return { ok: false, message: messageOf(error, response.status) };
    return { ok: true, ...data };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** "Pay now": the order's payment page, open or new. */
export async function payOrder(
  token: string,
): Promise<{ ok: true; payUrl: string | null; payProblem: string | null } | Failed> {
  try {
    const { data, error, response } = await api.POST('/api/public/orders/{token}/pay', {
      params: { path: { token } },
    });
    if (!data) return { ok: false, message: messageOf(error, response.status) };
    return { ok: true, ...data };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** Back from the payment page: has the money arrived? */
export async function checkOrder(
  token: string,
): Promise<{ ok: true; order: TrackedOrder } | Failed> {
  try {
    const { data, error, response } = await api.POST('/api/public/orders/{token}/check', {
      params: { path: { token } },
    });
    if (!data) return { ok: false, message: messageOf(error, response.status) };
    return { ok: true, order: data };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** Where the order stands now. */
export async function refreshOrder(
  token: string,
): Promise<{ ok: true; order: TrackedOrder } | Failed> {
  try {
    const { data, error, response } = await api.GET('/api/public/orders/{token}', {
      params: { path: { token } },
    });
    if (!data) return { ok: false, message: messageOf(error, response.status) };
    return { ok: true, order: data };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}
