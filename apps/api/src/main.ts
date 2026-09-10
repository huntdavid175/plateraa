import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app.setup';
import { AppModule } from './app.module';
import { ENV, type Env } from './config/env';

async function bootstrap() {
  // Body parsing is added by configureApp, after the Better Auth handler.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  await app.listen(app.get<Env>(ENV).PORT);
}

void bootstrap();
