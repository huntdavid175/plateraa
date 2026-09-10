import { Body, Controller, Get, HttpCode, Module, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity } from '@nestjs/swagger';
import { syncPushRequestSchema } from '@plateraa/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentDevice, DeviceGuard } from '../identity/guards';
import type { DeviceContext } from '../identity/request-context';
import { SyncService } from './sync.service';

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

/** Rows are typed loosely here; the phone's local tables (Phase 2) give them their shape. */
class PullResponseDto extends createZodDto(
  z.object({
    cursor: z.string(),
    changes: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
) {}

/**
 * Authenticated by the phone itself, not a PIN session, so queued sales still upload while the
 * screen is locked. Each command says who did it and is checked against their permissions.
 */
@Controller('sync')
@UseGuards(DeviceGuard)
@ApiSecurity('device')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  @ApiOkResponse({ type: PushResponseDto.Output })
  async push(@CurrentDevice() device: DeviceContext, @Body() body: PushDto) {
    return { results: await this.sync.push(device, body.commands) };
  }

  @Get('pull')
  @ApiOkResponse({ type: PullResponseDto.Output })
  pull(@CurrentDevice() device: DeviceContext, @Query() query: PullQueryDto) {
    return this.sync.pull(device, query.cursor);
  }
}

@Module({
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
