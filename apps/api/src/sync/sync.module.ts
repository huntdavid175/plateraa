import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Module,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiSecurity } from '@nestjs/swagger';
import { syncPushRequestSchema } from '@brixx/shared';
import * as Sentry from '@sentry/nestjs';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentDevice, DeviceGuard } from '../identity/guards';
import { headerValue, type AppRequest, type DeviceContext } from '../identity/request-context';
import { PaymentsModule } from '../payments/payments.module';
import { SyncService } from './sync.service';
import { TabletHealth, outboxReport } from './tablet-health';

/**
 * What the tablet says it has waiting, from `x-outbox-pending` and `x-outbox-oldest`. Read off the
 * request rather than declared, so they stay out of the OpenAPI document: the tablet adds them
 * itself, and older app versions don't send them.
 */
const reportOf = (req: AppRequest) =>
  outboxReport(headerValue(req, 'x-outbox-pending'), headerValue(req, 'x-outbox-oldest'));

class PushDto extends createZodDto(syncPushRequestSchema) {}

const pullQuerySchema = z.object({ cursor: z.string().regex(/^\d+$/).optional() });
class PullQueryDto extends createZodDto(pullQuerySchema) {}

class PushResponseDto extends createZodDto(
  z.object({
    results: z.array(
      z.union([
        z.object({
          id: z.string(),
          status: z.literal('APPLIED'),
          result: z.record(z.string(), z.unknown()),
        }),
        z.object({
          id: z.string(),
          /** REJECTED: refused for good ("Needs attention"). RETRY: try again later. */
          status: z.enum(['REJECTED', 'RETRY']),
          error: z.object({ code: z.string(), message: z.string() }),
        }),
      ]),
    ),
  }),
) {}

/** Rows are typed loosely here; the tablet's local tables (Phase 2) give them their shape. */
class PullResponseDto extends createZodDto(
  z.object({
    cursor: z.string(),
    changes: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
) {}

/**
 * Authenticated by the tablet itself, not a PIN session, so queued sales still upload while the
 * screen is locked. Each command says who did it and is checked against their permissions.
 */
@Controller('sync')
@UseGuards(DeviceGuard)
@ApiSecurity('device')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private readonly sync: SyncService,
    private readonly health: TabletHealth,
  ) {}

  /** Both routes carry what the tablet has waiting to upload (see tablet-health.ts). */
  @Post('push')
  @HttpCode(200)
  @ApiOkResponse({ type: PushResponseDto.Output })
  async push(
    @CurrentDevice() device: DeviceContext,
    @Body() body: PushDto,
    @Req() req: AppRequest,
  ) {
    await this.note(() => this.health.pushed(device, reportOf(req)));
    return { results: await this.sync.push(device, body.commands) };
  }

  @Get('pull')
  @ApiOkResponse({ type: PullResponseDto.Output })
  async pull(
    @CurrentDevice() device: DeviceContext,
    @Query() query: PullQueryDto,
    @Req() req: AppRequest,
  ) {
    const changes = await this.sync.pull(device, query.cursor);
    await this.note(() => this.health.synced(device, reportOf(req)));
    return changes;
  }

  /** Keeping track of a tablet's health must never stop it syncing. */
  private async note(work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      this.logger.error('Recording tablet health failed', error as Error);
      Sentry.captureException(error);
    }
  }
}

@Module({
  imports: [PaymentsModule],
  controllers: [SyncController],
  providers: [SyncService, TabletHealth],
})
export class SyncModule {}
