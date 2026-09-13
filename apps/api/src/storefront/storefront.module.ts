import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PhotosModule } from '../photos/photos';
import { PublicStoreController, PublicStoreService } from './public-store';
import { StorefrontSettingsController, StorefrontSettingsService } from './settings';

/** The online store (plan.md §4.0): its settings on the dashboard, and the public routes. */
@Module({
  imports: [PaymentsModule, PhotosModule],
  controllers: [StorefrontSettingsController, PublicStoreController],
  providers: [StorefrontSettingsService, PublicStoreService],
})
export class StorefrontModule {}
