import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AppealsAdminController } from './appeals/appeals-admin.controller.js';
import { AppealsController } from './appeals/appeals.controller.js';
import { AppealsService } from './appeals/appeals.service.js';
import { LiveAdminController } from './live/live-admin.controller.js';
import { LiveAdminService } from './live/live-admin.service.js';
import { LiveProvider, NullLiveProvider } from './live/live-provider.js';
import { ModerationNotices } from './moderation-notices.js';
import { ModerationController } from './moderation/moderation.controller.js';
import { ModerationService } from './moderation/moderation.service.js';
import { PolicyController } from './policy/policy.controller.js';
import { PolicyService } from './policy/policy.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { IncidentsController } from './safety/incidents.controller.js';
import { IncidentsService } from './safety/incidents.service.js';
import { TargetsService } from './targets.service.js';

/**
 * Trust and safety: people reporting things, moderators deciding them, people appealing, safety
 * incidents, and the live-session safety tools that have to exist before there is live video.
 */
@Module({
  imports: [AdminModule],
  controllers: [
    ReportsController,
    AppealsController,
    ModerationController,
    AppealsAdminController,
    IncidentsController,
    LiveAdminController,
    PolicyController,
  ],
  providers: [
    TargetsService,
    PolicyService,
    IncidentsService,
    ModerationNotices,
    ReportsService,
    ModerationService,
    AppealsService,
    LiveAdminService,
    { provide: LiveProvider, useClass: NullLiveProvider },
  ],
  exports: [TargetsService, PolicyService],
})
export class TrustModule {}
