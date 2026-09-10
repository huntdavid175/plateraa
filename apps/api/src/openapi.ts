import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * The API contract. The typed clients for the phone, dashboard and storefront are generated from
 * it (`pnpm --filter @plateraa/api openapi`, then `pnpm --filter @plateraa/api-client generate`).
 * Better Auth's /api/auth/* routes aren't included; clients use Better Auth's own client for those.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Plateraa API')
    .setVersion('1')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-device-token' }, 'device')
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
