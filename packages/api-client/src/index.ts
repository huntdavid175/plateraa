import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type { components, paths } from './schema.js';

/**
 * Where the client gets its credentials on each request, so a PIN session or business switch
 * takes effect without rebuilding the client.
 */
export interface ApiCredentials {
  /** Registered phone: its device token. */
  deviceToken?: () => string | null | undefined;
  /** PIN session token on the phone, or Better Auth session token on the dashboard. */
  bearer?: () => string | null | undefined;
  /** Dashboard: the business being worked on. */
  tenantId?: () => string | null | undefined;
}

/** A fetch client whose paths, bodies and responses are typed from the API's OpenAPI document. */
export function createApiClient(baseUrl: string, credentials: ApiCredentials = {}) {
  const client = createClient<paths>({ baseUrl });
  const addCredentials: Middleware = {
    onRequest({ request }) {
      const deviceToken = credentials.deviceToken?.();
      const bearer = credentials.bearer?.();
      const tenantId = credentials.tenantId?.();
      if (deviceToken) request.headers.set('x-device-token', deviceToken);
      if (bearer) request.headers.set('Authorization', `Bearer ${bearer}`);
      if (tenantId) request.headers.set('x-tenant-id', tenantId);
      return request;
    },
  };
  client.use(addCredentials);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
