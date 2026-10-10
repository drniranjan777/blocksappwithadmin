import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { ReachConfigService } from './reach-config.service.js';
import { ReachEventsService } from './reach-events.service.js';

/**
 * The parts of the Reach Engine the rest of the system calls into: the active configuration and
 * the recording of events. Kept apart from the controllers and the scoring job so the social
 * module can depend on it without a circle.
 */
@Module({
  imports: [AdminModule],
  providers: [ReachConfigService, ReachEventsService],
  exports: [ReachConfigService, ReachEventsService],
})
export class ReachCoreModule {}
