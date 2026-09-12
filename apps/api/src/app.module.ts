import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { PaymentsModule } from './payments/payments.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule,
    DatabaseModule,
    AuthModule,
    IdentityModule,
    PaymentsModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [
    // Reports unexpected errors to Sentry (see instrument.ts), then answers as Nest would.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
