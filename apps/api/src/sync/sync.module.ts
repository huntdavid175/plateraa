import { Body, Controller, Get, HttpCode, Module, Post, Query, UseGuards } from '@nestjs/common';
import { syncPushRequestSchema } from '@plateraa/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentDevice, DeviceGuard } from '../identity/guards';
import type { DeviceContext } from '../identity/request-context';
import { SyncService } from './sync.service';

class PushDto extends createZodDto(syncPushRequestSchema) {}

const pullQuerySchema = z.object({ cursor: z.string().regex(/^\d+$/).optional() });
class PullQueryDto extends createZodDto(pullQuerySchema) {}

/**
 * Authenticated by the phone itself, not a PIN session, so queued sales still upload while the
 * screen is locked. Each command says who did it and is checked against their permissions.
 */
@Controller('sync')
@UseGuards(DeviceGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  async push(@CurrentDevice() device: DeviceContext, @Body() body: PushDto) {
    return { results: await this.sync.push(device, body.commands) };
  }

  @Get('pull')
  pull(@CurrentDevice() device: DeviceContext, @Query() query: PullQueryDto) {
    return this.sync.pull(device, query.cursor);
  }
}

@Module({
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
