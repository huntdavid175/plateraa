import type { IncomingMessage } from 'node:http';
import type { Capability, Role } from '@plateraa/shared';

/** A registered tablet, identified by its device token. */
export interface DeviceContext {
  id: string;
  tenantId: string;
  locationId: string;
  code: string;
}

/** An owner/manager email login (Better Auth). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Who is acting, in which business, with what permissions. Set by ActorGuard. */
export interface Actor {
  /** 'device': a PIN session on a registered tablet. 'dashboard': an owner/manager login. */
  kind: 'device' | 'dashboard';
  tenantId: string;
  staffId: string;
  deviceId: string | null;
  role: Role;
  capabilities: ReadonlySet<Capability>;
}

export interface AppRequest extends IncomingMessage {
  authUser?: AuthUser;
  device?: DeviceContext;
  actor?: Actor;
}

export function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function bearerToken(req: IncomingMessage): string | undefined {
  const header = headerValue(req, 'authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
}
