import { createApiClient } from '@plateraa/api-client';
import { session } from './session';

export const API_URL: string = import.meta.env.VITE_API_URL || 'https://plateraa-api.onrender.com';

export const api = createApiClient(API_URL, {
  bearer: () => session.get().token,
  tenantId: () => session.get().tenantId,
});

// A login that has expired or been signed out elsewhere goes back to the sign-in page.
api.use({
  onResponse({ response }) {
    if (response.status === 401) session.signOut();
    return response;
  },
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const OFFLINE = "Can't reach Plateraa. Check your internet connection and try again.";

function messageOf(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  if (status >= 500) return 'Something went wrong on our side. Try again in a moment.';
  return 'That didn’t work. Try again.';
}

/** Runs an API call and returns its data, or throws an ApiError with words for the screen. */
export async function call<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof request>;
  try {
    result = await request;
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  if (!result.response.ok) {
    throw new ApiError(messageOf(result.error, result.response.status), result.response.status);
  }
  return result.data as T;
}

/**
 * Signs in with Better Auth and returns the bearer token. Better Auth isn't in the OpenAPI
 * document, so this is a plain fetch; the token comes back in the set-auth-token header.
 */
export async function signIn(email: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  const body = (await response.json().catch(() => ({}))) as { token?: string; code?: string };
  if (response.status === 401 || body.code === 'INVALID_EMAIL_OR_PASSWORD') {
    throw new ApiError('That email and password don’t match.', 401);
  }
  if (!response.ok) throw new ApiError(messageOf(body, response.status), response.status);
  const token = response.headers.get('set-auth-token') ?? body.token;
  if (!token) throw new ApiError('Signing in didn’t finish. Try again.', response.status);
  return token;
}

/** Forgets the login here at once, and ends it on the server when there's a connection. */
export function signOut() {
  const { token } = session.get();
  session.signOut();
  if (!token) return;
  fetch(`${API_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {
    // offline: the session simply expires on the server
  });
}
