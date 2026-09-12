import { Global, Module } from '@nestjs/common';
import { DevicesController, DevicesService } from './devices';
import { Directories } from './directories.service';
import { ActorGuard, CapabilityGuard, DeviceGuard, SessionGuard } from './guards';
import { MeController, MeService } from './me';
import { OnboardingController, OnboardingService } from './onboarding';
import { PinLoginController, PinLoginService } from './pin-login';
import { PinSessionService } from './pin-session.service';
import { StaffController, StaffService } from './staff';

/** Logins, businesses, tablets, PINs and permissions. The guards are exported for every module. */
@Global()
@Module({
  controllers: [
    OnboardingController,
    MeController,
    DevicesController,
    PinLoginController,
    StaffController,
  ],
  providers: [
    Directories,
    MeService,
    PinSessionService,
    SessionGuard,
    DeviceGuard,
    ActorGuard,
    CapabilityGuard,
    OnboardingService,
    DevicesService,
    PinLoginService,
    StaffService,
  ],
  exports: [Directories, PinSessionService, SessionGuard, DeviceGuard, ActorGuard, CapabilityGuard],
})
export class IdentityModule {}
