import type { NestExpressApplication } from '@nestjs/platform-express';
import type { SyncCommandInput } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import type { Vendor } from './fixtures';

type Server = ReturnType<NestExpressApplication['getHttpServer']>;

export interface PushResultBody {
  id: string;
  status: 'APPLIED' | 'REJECTED' | 'RETRY';
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

/** Builds commands the way a phone does (ULID ids, rising device sequence) and pushes them. */
export function syncClient(server: Server, vendor: Vendor) {
  let seq = 0;

  function command<T extends SyncCommandInput['type']>(
    type: T,
    payload: Extract<SyncCommandInput, { type: T }>['payload'],
    staffId = vendor.ownerStaffId,
  ) {
    return {
      id: ulid(),
      deviceSeq: ++seq,
      deviceTs: new Date().toISOString(),
      staffId,
      type,
      payload,
    };
  }

  async function push(...commands: unknown[]): Promise<PushResultBody[]> {
    const res = await request(server)
      .post('/api/sync/push')
      .set('x-device-token', vendor.deviceToken)
      .send({ commands })
      .expect(200);
    return res.body.results;
  }

  async function pushOne(commandToPush: unknown): Promise<PushResultBody> {
    const [result] = await push(commandToPush);
    return result!;
  }

  return { command, push, pushOne };
}
