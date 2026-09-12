import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Text that may be null, for a response DTO. Zod describes `z.string().nullable()` as
 * `type: ['string', 'null']`, which @nestjs/swagger mistakes for an array when it's a DTO's
 * top-level field, so the clients would expect a list. The meta keeps it a nullable string.
 */
export const nullableText = () => z.nullable(z.string()).meta({ type: 'string', nullable: true });

/** Yes, no or null, for the same reason as `nullableText`. */
export const nullableFlag = () => z.nullable(z.boolean()).meta({ type: 'boolean', nullable: true });

/**
 * The API contract. The typed clients for the tablet, dashboard and storefront are generated from
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
