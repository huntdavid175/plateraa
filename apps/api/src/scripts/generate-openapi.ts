import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildOpenApiDocument } from '../openapi';
import { OFFLINE_TEST_ENV, createTestApp } from '../test/test-app';

// Runs from apps/api/dist/scripts; writes to packages/api-client/openapi.json.
const OUTPUT = resolve(__dirname, '../../../../packages/api-client/openapi.json');

async function main() {
  const app = await createTestApp(OFFLINE_TEST_ENV);
  const document = buildOpenApiDocument(app);
  await app.close();
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(document.paths).length} paths to ${OUTPUT}`);
}

void main();
