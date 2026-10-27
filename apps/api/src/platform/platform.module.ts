import { Module } from '@nestjs/common';
import { PlatformAudit, PlatformAuditController } from './audit-log';
import { PlatformBusinesses, PlatformBusinessesController } from './businesses';
import { PlatformGuard } from './guard';
import { PlatformInsights, PlatformInsightsController } from './insights';
import { PlatformSearch, PlatformSearchController } from './search';
import { PlatformTeam, PlatformTeamController } from './team';

/**
 * The admin console's API (apps/admin), under /api/platform: Brixx's own team, across every
 * business. Reads go through `withPlatform`; every change runs in the business's own `withTenant`
 * transaction with an audit row naming the team member.
 */
@Module({
  controllers: [
    PlatformTeamController,
    PlatformInsightsController,
    PlatformBusinessesController,
    PlatformSearchController,
    PlatformAuditController,
  ],
  providers: [
    PlatformGuard,
    PlatformTeam,
    PlatformInsights,
    PlatformBusinesses,
    PlatformSearch,
    PlatformAudit,
  ],
})
export class PlatformModule {}
