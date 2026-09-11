import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { ENV, type Env } from '../config/env';

export interface PinSessionClaims {
  tenantId: string;
  staffId: string;
  deviceId: string;
}

const ISSUER = 'plateraa:api';
const AUDIENCE = 'plateraa:device';
export const PIN_SESSION_MINUTES = 15;

/**
 * Short-lived tokens for a staff member unlocked on a specific tablet. Signed with HS256: only
 * this API issues and verifies them. Permissions aren't baked in; they're re-read on every
 * request, so a role change applies immediately.
 */
@Injectable()
export class PinSessionService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.SESSION_SIGNING_SECRET);
  }

  async issue(claims: PinSessionClaims): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + PIN_SESSION_MINUTES * 60_000);
    const token = await new SignJWT({ tid: claims.tenantId, did: claims.deviceId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.staffId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<PinSessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      const { sub, tid, did } = payload;
      if (typeof sub !== 'string' || typeof tid !== 'string' || typeof did !== 'string')
        return null;
      return { staffId: sub, tenantId: tid, deviceId: did };
    } catch {
      return null;
    }
  }
}
