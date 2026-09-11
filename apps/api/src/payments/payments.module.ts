import { Body, Controller, HttpCode, Ip, Module, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ENV, type Env } from '../config/env';
import { MOOLRE, MoolreHttpClient, type MoolreApi } from './moolre';
import { PaymentLinks } from './payment-links.service';

/**
 * Where Moolre tells us about a payment-link payment. Public, because Moolre can't log in; it
 * proves nothing by itself, so the payment it mentions only counts once Moolre's status check
 * confirms it. Answers at once, and does the checking afterwards.
 */
@Controller('payments/moolre')
@ApiExcludeController()
export class MoolreCallbackController {
  constructor(private readonly links: PaymentLinks) {}

  @Post('callback')
  @HttpCode(200)
  async callback(@Body() body: unknown, @Ip() ip: string | undefined) {
    const event = await this.links.record(body, ip ?? null);
    this.links.process(event);
    return { received: true };
  }
}

@Module({
  controllers: [MoolreCallbackController],
  providers: [
    PaymentLinks,
    {
      provide: MOOLRE,
      inject: [ENV],
      useFactory: (env: Env): MoolreApi =>
        new MoolreHttpClient({
          baseUrl: env.MOOLRE_BASE_URL,
          smsVasKey: env.MOOLRE_SMS_VASKEY,
          smsSenderId: env.MOOLRE_SMS_SENDER_ID,
        }),
    },
  ],
  exports: [PaymentLinks],
})
export class PaymentsModule {}
