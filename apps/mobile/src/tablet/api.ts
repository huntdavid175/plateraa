import { createApiClient } from '@plateraa/api-client';
import type { Role } from '@plateraa/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL } from '../config';

/**
 * The calls the tablet makes directly rather than through the sync engine: setting itself up
 * (an owner or manager signed in with email) and the few things that only work online.
 */

/** Something the server refused, or couldn't be reached for, in words to show on screen. */
export class ApiProblem extends Error {
  override name = 'ApiProblem';

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Business {
  tenantId: string;
  name: string;
  slug: string;
  /** The signed-in person's own staff record in that business. */
  staffId: string;
  role: Role;
}

const OFFLINE = "Can't reach Plateraa. Check the internet connection and try again.";
/** The server can take up to a minute to wake up when nobody has used it for a while. */
const TIMEOUT_MS = 70_000;

export function problemText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function messageOf(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return fallback;
}

async function call<T>(
  send: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response: Response }>,
  fallback: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let outcome: Awaited<ReturnType<typeof send>>;
  try {
    outcome = await send(controller.signal);
  } catch {
    throw new ApiProblem(OFFLINE, 0);
  } finally {
    clearTimeout(timer);
  }
  if (!outcome.response.ok) {
    throw new ApiProblem(messageOf(outcome.error, fallback), outcome.response.status);
  }
  return outcome.data as T;
}

/** An owner or manager signs in with email, once, to register the tablet. Returns their session. */
export async function signIn(email: string, password: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiProblem(OFFLINE, 0);
  } finally {
    clearTimeout(timer);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiProblem(
      response.status === 401 ? 'Wrong email or password' : messageOf(body, 'Could not sign in'),
      response.status,
    );
  }
  const token =
    response.headers.get('set-auth-token') ?? (body as { token?: string } | null)?.token;
  if (!token) throw new ApiProblem('Could not sign in', response.status);
  return token;
}

/** Calls made as the signed-in owner or manager while setting the tablet up. */
export function ownerApi(session: string, tenantId?: string) {
  const api = createApiClient(API_URL, { bearer: () => session, tenantId: () => tenantId });
  return {
    async businesses(): Promise<Business[]> {
      const list = await call(
        (signal) => api.GET('/api/me/businesses', { signal }),
        'Could not load your businesses',
      );
      return list as Business[];
    },

    registerDevice(forTenant: string, name: string) {
      return call(
        (signal) =>
          api.POST('/api/devices/register', {
            body: {
              tenantId: forTenant,
              name,
              platform: `${Platform.OS} ${Platform.Version}`,
              appVersion: Constants.expoConfig?.version,
            },
            signal,
          }),
        'Could not register this tablet',
      );
    },

    setPin(staffId: string, pin: string) {
      return call(
        (signal) =>
          api.PUT('/api/staff/{id}/pin', {
            params: { path: { id: staffId } },
            body: { pin },
            signal,
          }),
        'Could not set the PIN',
      );
    },

    /** Ends the email login once setup is done: the tablet keeps only its device token. */
    async signOut(): Promise<void> {
      await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session}` },
      }).catch(() => undefined);
    },
  };
}

/**
 * Adds someone at the counter. Online only: the server hashes their PIN. The manager confirms
 * with their own PIN, which opens a short server session for this one change.
 */
export async function addStaffAtCounter(input: {
  deviceToken: string;
  managerId: string;
  managerPin: string;
  person: { displayName: string; role: 'MANAGER' | 'STAFF' | 'RIDER'; pin: string };
}) {
  const tablet = createApiClient(API_URL, { deviceToken: () => input.deviceToken });
  const session = await call(
    (signal) =>
      tablet.POST('/api/sessions/pin', {
        body: { staffId: input.managerId, pin: input.managerPin },
        signal,
      }),
    'Could not check your PIN',
  );
  const manager = createApiClient(API_URL, {
    deviceToken: () => input.deviceToken,
    bearer: () => session.token,
  });
  return call(
    (signal) => manager.POST('/api/staff', { body: input.person, signal }),
    'Could not add this person',
  );
}
