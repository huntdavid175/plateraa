import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './openapi';
import { createTestApp } from './test/test-app';

describe('OpenAPI document', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('describes every endpoint the tablet depends on, with request and response shapes', () => {
    const document = buildOpenApiDocument(app);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/onboarding/business',
        '/api/me/businesses',
        '/api/devices/register',
        '/api/devices/current/staff',
        '/api/sessions/pin',
        '/api/staff',
        '/api/sync/push',
        '/api/sync/pull',
      ]),
    );

    const push = document.paths['/api/sync/push']?.post;
    expect(push?.requestBody).toBeDefined();
    expect(push?.responses['200']).toBeDefined();
    expect(document.paths['/api/sessions/pin']?.post?.responses['200']).toBeDefined();
  });
});
