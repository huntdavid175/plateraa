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
        '/api/me/context',
        '/api/orders',
        '/api/orders/refunds-owed',
        '/api/orders/{orderId}',
        '/api/orders/{orderId}/refunds',
        '/api/orders/{orderId}/discount',
        '/api/drawers',
        '/api/drawers/{shiftId}/payouts',
        '/api/menu',
        '/api/settings',
        '/api/settings/business',
        '/api/settings/orders',
        '/api/settings/moolre',
        '/api/settings/commissions',
        '/api/menu/items/{itemId}',
        '/api/menu/items/{itemId}/sold-out',
        '/api/menu/categories',
        '/api/menu/categories/{categoryId}',
        '/api/reports/day',
        '/api/devices/register',
        '/api/devices/current/staff',
        '/api/sessions/pin',
        '/api/staff',
        '/api/staff/{id}',
        '/api/staff/revenue-visibility',
        '/api/devices',
        '/api/devices/{id}/sign-out',
        '/api/sync/push',
        '/api/sync/pull',
      ]),
    );

    const push = document.paths['/api/sync/push']?.post;
    expect(push?.requestBody).toBeDefined();
    expect(push?.responses['200']).toBeDefined();
    expect(document.paths['/api/sessions/pin']?.post?.responses['200']).toBeDefined();
  });

  it('describes text that may be null as text, not as a list', () => {
    const document = buildOpenApiDocument(app);
    const row = document.components?.schemas?.['OrderRowDto_Output'] as {
      properties: Record<string, { type?: string; nullable?: boolean }>;
    };
    expect(row.properties['takenBy']).toMatchObject({ type: 'string', nullable: true });
  });
});
