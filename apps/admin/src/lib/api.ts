import { createApiClient, type components } from '@brixx/api-client';
import { session } from './session';

export const API_URL: string = import.meta.env.VITE_API_URL || 'https://plateraa-api.onrender.com';

export const api = createApiClient(API_URL, { bearer: () => session.token() });

// An expired login goes back to the sign-in page.
api.use({
  onResponse({ response }) {
    if (response.status === 401) session.signOut();
    return response;
  },
});

type Schemas = components['schemas'];
export type Me = Schemas['PlatformMeDto_Output'];
export type Overview = Schemas['OverviewDto_Output'];
export type BusinessRow = Schemas['BusinessRowDto_Output'];
export type BusinessDetail = Schemas['BusinessDetailDto_Output'];
export type Request = Schemas['RequestDto_Output'];
export type RequestDetail = Schemas['RequestDetailDto_Output'];
export type Analytics = Schemas['AnalyticsDto_Output'];
export type Health = Schemas['HealthDto_Output'];
export type SearchResult = Schemas['SearchDto_Output'];
export type AuditRow = Schemas['AuditRowDto_Output'];
export type TeamMember = Schemas['TeamMemberDto_Output'];
export type Tablet = Health['tablets'][number];
export type Capability = Me['capabilities'][number];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const OFFLINE = "Can't reach Brixx. Check your internet connection and try again.";

function messageOf(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  if (status === 403) return "You don't have permission to do that.";
  if (status >= 500) return 'Something went wrong on our side. Try again in a moment.';
  return 'That didn’t work. Try again.';
}

/** Runs an API call and returns its data, or throws an ApiError worded for the screen. */
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

/** Signs in with Better Auth (not in the OpenAPI document) and returns the bearer token. */
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

export async function signOut() {
  const token = session.token();
  session.signOut();
  if (!token) return;
  await fetch(`${API_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}

/** The audit log as CSV: a plain fetch, since the typed client reads JSON. */
export async function downloadAuditCsv(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/platform/audit/export?${params}`, {
      headers: { Authorization: `Bearer ${session.token()}` },
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  if (!response.ok) {
    throw new ApiError(
      messageOf(await response.json().catch(() => ({})), response.status),
      response.status,
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `brixx-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
