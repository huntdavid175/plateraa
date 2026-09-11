import type { ApiClient } from '@plateraa/api-client';
import type { SyncCommandInput } from '@plateraa/shared';
import type { PullChanges } from './store';

export type PushOutcome =
  | { id: string; status: 'APPLIED'; result: Record<string, unknown> }
  | { id: string; status: 'REJECTED' | 'RETRY'; error: { code: string; message: string } };

export interface PullResponse {
  cursor: string;
  changes: PullChanges;
}

/** How the sync engine talks to the server; tests swap in a fake. */
export interface SyncTransport {
  push(commands: SyncCommandInput[]): Promise<PushOutcome[]>;
  pull(cursor: string | null): Promise<PullResponse>;
}

/**
 * offline: no answer (no internet, or it took too long). server: the server failed.
 * unauthorized: this tablet's device token no longer works. invalid: the server couldn't read
 * what was sent.
 */
export type TransportErrorKind = 'offline' | 'server' | 'unauthorized' | 'invalid';

export class TransportError extends Error {
  override name = 'TransportError';

  constructor(
    readonly kind: TransportErrorKind,
    message: string,
  ) {
    super(message);
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return fallback;
}

/** POST /api/sync/push and GET /api/sync/pull, authenticated by the tablet's device token. */
export function httpTransport(api: ApiClient, timeoutMs = 20_000): SyncTransport {
  async function call<T>(
    send: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response: Response }>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let outcome: Awaited<ReturnType<typeof send>>;
    try {
      outcome = await send(controller.signal);
    } catch (error) {
      throw new TransportError('offline', error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }

    const { data, error, response } = outcome;
    if (response.ok && data !== undefined) return data;
    if (response.status === 401 || response.status === 403) {
      throw new TransportError('unauthorized', messageOf(error, 'This tablet is signed out'));
    }
    if (response.status === 400) {
      throw new TransportError('invalid', messageOf(error, 'The server could not read this'));
    }
    throw new TransportError('server', `The server answered ${response.status}`);
  }

  return {
    async push(commands) {
      const body = await call((signal) =>
        api.POST('/api/sync/push', { body: { commands } as never, signal }),
      );
      return body.results as PushOutcome[];
    },
    async pull(cursor) {
      const body = await call((signal) =>
        api.GET('/api/sync/pull', {
          params: { query: cursor === null ? {} : { cursor } },
          signal,
        }),
      );
      return body as PullResponse;
    },
  };
}
