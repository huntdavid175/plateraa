import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

class HealthDto extends createZodDto(z.object({ status: z.literal('ok') })) {}

@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthDto.Output })
  check() {
    return { status: 'ok' as const };
  }
}
